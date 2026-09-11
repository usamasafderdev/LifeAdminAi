import fs from 'node:fs/promises';
import { createTextPdf, createMultiPageTextPdf } from './pdfTestFixture.js';

export const assignmentText =
  'Submission Requirements\nSubmit the assignment as a PDF by September 18, 2026.\nThe upload portal is CampusBox.';
export const archivePages = Array.from({ length: 130 }, (_, i) =>
  [
    `Archive section ${i + 1}`,
    ...(i === 112 ? ['The submarine access code is COBALT-731.'] : []),
    ...Array(35).fill('The archive describes routine historical observations.'),
  ].join('\n'),
);
export async function createKnowledgeFixtures() {
  const directory = new URL('../../../docs/fixtures/document-knowledge/', import.meta.url);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(new URL('Assignment.pdf', directory), createTextPdf(assignmentText));
  await fs.writeFile(
    new URL('Archive-130-pages.pdf', directory),
    createMultiPageTextPdf(archivePages),
  );
  await fs.writeFile(new URL('Empty.pdf', directory), createTextPdf(''));
  await fs.writeFile(
    new URL('Broken.pdf', directory),
    '%PDF-1.4\nThis is intentionally not a valid PDF.',
  );
  console.log('Created four PDF fixtures in docs/fixtures/document-knowledge.');
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/createKnowledgeFixtures.js'))
  await createKnowledgeFixtures();
