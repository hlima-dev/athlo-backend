import {
  PrismaClient,
  UserRole,
  UserStatus,
} from '@prisma/client'

import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  // ====================================
  // ADMIN
  // ====================================

  const adminPassword = await bcrypt.hash(
    'Admin@2024',
    12,
  )

  const admin = await prisma.user.upsert({
    where: {
      email: 'admin@asdasorocaba.org.br',
    },

    update: {},

    create: {
      name: 'Administrador ASDA',
      email: 'admin@asdasorocaba.org.br',
      password: adminPassword,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  })

  console.log(
    `✅ Admin criado: ${admin.email}`,
  )

  // ====================================
  // COACH
  // ====================================

  const coachPassword = await bcrypt.hash(
    'Coach@2024',
    12,
  )

  const coach = await prisma.user.upsert({
    where: {
      email: 'coach@asdasorocaba.org.br',
    },

    update: {},

    create: {
      name: 'Técnico ASDA',
      email: 'coach@asdasorocaba.org.br',
      password: coachPassword,
      role: UserRole.COACH,
      status: UserStatus.ACTIVE,
    },
  })

  console.log(
    `✅ Coach criado: ${coach.email}`,
  )

  // ====================================
  // USUÁRIO ATLETA
  // ====================================

  const athletePassword = await bcrypt.hash(
    'Athlete@2024',
    12,
  )

  const athleteUser =
    await prisma.user.upsert({
      where: {
        email:
          'atleta@asdasorocaba.org.br',
      },

      update: {},

      create: {
        name: 'Lucas Santos',
        email:
          'atleta@asdasorocaba.org.br',
        password: athletePassword,

        // ALTERADO PARA COACH
        role: UserRole.COACH,

        status: UserStatus.ACTIVE,
      },
    })

  console.log(
    `✅ Atleta criado: ${athleteUser.email}`,
  )

  console.log(
    `🆔 USER ID: ${athleteUser.id}`,
  )

  console.log(
    '\n🎉 Seed concluído com sucesso!',
  )
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })