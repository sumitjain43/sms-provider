import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

async function main() {
  console.log('[Seed] Seeding initial SMS Gateway project & test key...');

  let project = await prisma.project.findFirst({
    where: { name: 'Demo Workspace' },
  });

  if (!project) {
    project = await prisma.project.create({
      data: {
        name: 'Demo Workspace',
        environment: 'development',
      },
    });
    console.log(`[Seed] Created Project: ${project.name} (${project.id})`);
  } else {
    console.log(`[Seed] Project already exists: ${project.name} (${project.id})`);
  }

  // Predictable test key for testing and local verification
  const devRawKey = 'bk_test_demo_secret_key_123456789';
  const hashedSecret = sha256(devRawKey);

  const existingKey = await prisma.apiKey.findFirst({
    where: { hashedSecret },
  });

  if (!existingKey) {
    await prisma.apiKey.create({
      data: {
        projectId: project.id,
        name: 'Local Dev Master Key',
        prefix: 'bk_test_',
        hashedSecret,
        scopes: JSON.stringify(['*']),
      },
    });
    console.log('[Seed] Created Test API Key: bk_test_demo_secret_key_123456789');
  } else {
    console.log('[Seed] Test API Key already configured.');
  }

  console.log('[Seed] Completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
