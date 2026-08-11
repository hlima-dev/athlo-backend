import { PrismaClient, OrgRole, UserStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  // ====================================
  // PLANOS
  // ====================================

  const plans = [
    {
      name: 'Free',
      slug: 'free',
      priceMonthly: 0,
      priceYearly: 0,
      maxUsers: 2,
      maxContacts: 50,
      features: ['Contatos', 'Agenda', 'Financeiro básico'],
    },
    {
      name: 'Starter',
      slug: 'starter',
      priceMonthly: 49.9,
      priceYearly: 499,
      maxUsers: 5,
      maxContacts: 1000,
      features: ['Contatos ilimitados até 1000', 'Financeiro completo', 'Catálogo de produtos', 'Relatórios'],
    },
    {
      name: 'Pro',
      slug: 'pro',
      priceMonthly: 129.9,
      priceYearly: 1299,
      maxUsers: 20,
      maxContacts: 10000,
      features: ['Tudo do Starter', 'Usuários ilimitados até 20', 'Suporte prioritário', 'Convites de equipe'],
    },
  ]

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: {},
      create: plan,
    })
  }

  console.log(`✅ ${plans.length} planos criados`)

  // ====================================
  // ORGANIZAÇÃO DEMO
  // ====================================

  const starterPlan = await prisma.plan.findUniqueOrThrow({ where: { slug: 'starter' } })

  const organization = await prisma.organization.upsert({
    where: { slug: 'athlo-demo' },
    update: {},
    create: {
      name: 'ATHLO Demo Ltda',
      slug: 'athlo-demo',
      email: 'contato@athlodemo.com.br',
      status: 'ACTIVE',
    },
  })

  await prisma.subscription.upsert({
    where: { organizationId: organization.id },
    update: {},
    create: {
      organizationId: organization.id,
      planId: starterPlan.id,
      status: 'ACTIVE',
      currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  })

  console.log(`✅ Organização demo criada: ${organization.name}`)

  // ====================================
  // USUÁRIO OWNER
  // ====================================

  const ownerPassword = await bcrypt.hash('Admin@2024', 12)

  const owner = await prisma.user.upsert({
    where: { email: 'admin@athlodemo.com.br' },
    update: {},
    create: {
      organizationId: organization.id,
      name: 'Administrador ATHLO',
      email: 'admin@athlodemo.com.br',
      password: ownerPassword,
      orgRole: OrgRole.OWNER,
      status: UserStatus.ACTIVE,
    },
  })

  console.log(`✅ Owner criado: ${owner.email}`)
  console.log('\n🎉 Seed concluído com sucesso!')
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
