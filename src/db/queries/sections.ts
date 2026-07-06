import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { sections } from '@/db/schema';

export type SectionKind = (typeof sections.$inferSelect)['kind'];

export function listActiveSections() {
  return db.select().from(sections).where(isNull(sections.archivedAt));
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
