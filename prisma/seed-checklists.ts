import { db } from "../src/lib/db";
import { newToken, tokenHash } from "../src/lib/crypto";
import {
  getTemplate,
  saveTemplate,
  templateAction,
} from "../src/lib/workflow-templates";
import { checklistDefinition } from "../src/lib/checklist-validation";
// New draft versions only: never mutate published definitions or existing runtime work.
export async function seedDemoChecklists() {
  for (const email of ["admin@demo.setu.test", "admin@sample.setu.test"]) {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) continue;
    const token = newToken();
    const session = await db.session.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    try {
      const templates = await db.workflowTemplate.findMany({
        where: { firmId: user.firmId, status: "Published" },
        orderBy: { versionNumber: "asc" },
      });
      const families = new Set<string>();
      for (const source of templates) {
        if (families.has(source.familyId)) continue;
        families.add(source.familyId);
        if (
          await db.workflowTemplate.findFirst({
            where: {
              firmId: user.firmId,
              familyId: source.familyId,
              stages: { some: { checklistItems: { some: {} } } },
            },
          })
        )
          continue;
        const n = source.name.toLowerCase();
        const titles = n.includes("close")
          ? [
              "Bank reconciliation",
              "Credit card reconciliation",
              "Accruals",
              "Prepayments",
              "Fixed asset reconciliation",
              "Balance sheet substantiation",
              "Financial statement preparation",
            ]
          : n.includes("book")
            ? [
                "Download transactions",
                "Categorize transactions",
                "Review uncategorized items",
                "Bank reconciliation",
                "Review exceptions",
              ]
            : n.includes("1040") || n.includes("1065") || n.includes("1120")
              ? [
                  "Document completeness",
                  "Prior-year review",
                  "Current-year preparation",
                  "Supporting schedules",
                  "Reviewer checks",
                  "Final approval checks",
                ]
              : n.includes("audit") || n.includes("assurance")
                ? [
                    "Planning",
                    "Evidence collection",
                    "Testing",
                    "Review observations",
                    "Finalization",
                  ]
                : [];
        if (!titles.length) continue;
        const version = await templateAction(token, source.id, {
          action: "version",
          revision: source.revision,
        });
        const draft = await getTemplate(token, version.id);
        const target =
          draft.stages.find((s) => s.category === "Preparation") ??
          draft.stages.find((s) => !s.isStart && !s.isCompletion) ??
          draft.stages[0];
        await saveTemplate(
          token,
          {
            ...draft,
            stages: draft.stages.map((s) => ({
              ...s,
              checklistItems:
                s.id === target.id
                  ? titles.map((title, i) =>
                      checklistDefinition.parse({
                        itemCode: `DEMO-${i + 1}`,
                        itemTitle: title,
                        instructions: `Complete ${title.toLowerCase()}, document the work performed, and discuss exceptions with the reviewer. Adapt this demo example to firm policy.`,
                        defaultOwnerType: "Preparer",
                        relativeDueDays: i + 1,
                      }),
                    )
                  : [],
            })),
          },
          draft.id,
        );
      }
    } finally {
      await db.session.delete({ where: { id: session.id } });
    }
  }
}
