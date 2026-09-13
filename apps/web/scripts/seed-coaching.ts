/**
 * Idempotent seeder for the AI Sales Coach (Phase 1).
 * Upserts modules → lessons → quizzes, plus assignments + knowledge, by stable
 * `slug`. Safe to re-run. Run AFTER the migration:
 *
 *   cd apps/web && bun run scripts/seed-coaching.ts
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Bun auto-loads
 * .env.local). Mirrors the other scripts in this folder.
 */
import { createClient } from "@supabase/supabase-js";
import {
  SEED_MODULES,
  SEED_ASSIGNMENTS,
  SEED_KNOWLEDGE,
} from "../src/lib/coaching/seed/content";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function upsert<T extends Record<string, unknown>>(table: string, row: T): Promise<{ id: string }> {
  const { data, error } = await db.from(table).upsert(row, { onConflict: "slug" }).select("id").single();
  if (error) throw new Error(`${table} upsert (${String(row.slug)}): ${error.message}`);
  return data as { id: string };
}

async function main() {
  let modules = 0, lessons = 0, quizzes = 0, assignments = 0, knowledge = 0;

  for (const m of SEED_MODULES) {
    const mod = await upsert("coach_modules", {
      slug: m.slug,
      title: m.title,
      description: m.description,
      role_applicability: m.role_applicability,
      sequence_order: m.sequence_order,
      is_active: true,
    });
    modules++;

    for (let li = 0; li < m.lessons.length; li++) {
      const l = m.lessons[li];
      const lesson = await upsert("coach_lessons", {
        slug: l.slug,
        module_id: mod.id,
        title: l.title,
        objective: l.objective ?? null,
        content: l.content,
        examples: l.examples ?? null,
        do_dont_notes: l.do_dont_notes ?? null,
        sequence_order: li + 1,
        is_active: true,
      });
      lessons++;

      for (let qi = 0; qi < (l.quizzes ?? []).length; qi++) {
        const q = l.quizzes![qi];
        await upsert("coach_quizzes", {
          slug: q.slug,
          lesson_id: lesson.id,
          module_id: mod.id,
          question: q.question,
          question_type: q.question_type,
          options_json: q.options ?? [],
          correct_answer: q.correct_answer ?? null,
          explanation: q.explanation ?? null,
          sequence_order: qi + 1,
          is_active: true,
        });
        quizzes++;
      }
    }
  }

  for (const a of SEED_ASSIGNMENTS) {
    await upsert("coach_assignments", {
      slug: a.slug,
      title: a.title,
      description: a.description,
      assignment_type: a.assignment_type,
      due_frequency: a.due_frequency,
      evaluation_method: "manager",
      is_active: true,
    });
    assignments++;
  }

  for (const k of SEED_KNOWLEDGE) {
    await upsert("coach_knowledge_base", {
      slug: k.slug,
      category: k.category,
      title: k.title,
      content: k.content,
      is_active: true,
    });
    knowledge++;
  }

  console.log(
    `✓ Seeded coaching: ${modules} modules, ${lessons} lessons, ${quizzes} quizzes, ${assignments} assignments, ${knowledge} knowledge articles.`,
  );
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
