import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { sections } from '@/db/schema';

export type SectionKind = (typeof sections.$inferSelect)['kind'];

export const DEFAULT_SECTION_NAME = 'General';

export function listActiveSections() {
  return db.select().from(sections).where(isNull(sections.archivedAt));
}

export async function getOrCreateDefaultSection() {
  const existing = await db
    .select()
    .from(sections)
    .where(and(eq(sections.name, DEFAULT_SECTION_NAME), isNull(sections.archivedAt)));

  if (existing[0]) {
    return existing[0];
  }

  const [created] = await createSection({
    name: DEFAULT_SECTION_NAME,
    icon: 'house',
    color: '#60646C',
    kind: 'both',
  });

  return created;
}

export function createSection(input: { name: string; icon: string; color: string; kind: SectionKind }) {
  return db.insert(sections).values(input).returning();
}

export function updateSection(id: number, input: Partial<{ name: string; icon: string; color: string; kind: SectionKind }>) {
  return db.update(sections).set(input).where(eq(sections.id, id)).returning();
}

export function archiveSection(id: number) {
  return db
    .update(sections)
    .set({ archivedAt: new Date() })
    .where(and(eq(sections.id, id), isNull(sections.archivedAt)))
    .returning();
}
