import { z } from 'zod';
export const teamRowSchema = z.object({ user_id: z.string(), full_name: z.string(), branch_id: z.string(), branch_name: z.string(), is_senior: z.boolean(), courses: z.number(), courses_completed: z.number(), avg_progress: z.number(), offline_targets: z.number(), offline_attended: z.number(), field_coaching: z.number(), manager_coaching: z.number(), plans_needed: z.number(), plans_written: z.number(), followup_needed: z.number(), can_open: z.boolean() });
export type TeamRow = z.infer<typeof teamRowSchema>;
export const branchSchema = z.array(z.object({ branch_id: z.string(), branch_name: z.string() }));
export function planLabel(r: TeamRow) { return r.plans_needed === 0 ? '대상 없음' : `${r.plans_written}/${r.plans_needed}건 작성`; }
export function teamTotals(rows: TeamRow[]) { return { people: rows.length, followup: rows.reduce((a, r) => a + r.followup_needed, 0), missingPlans: rows.reduce((a, r) => a + Math.max(0, r.plans_needed - r.plans_written), 0), coaching: rows.reduce((a, r) => a + r.field_coaching + r.manager_coaching, 0) }; }
