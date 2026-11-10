/**
 * Roda UMA VEZ no rollout do controle de acesso granular por módulo:
 * cria ModulePermission habilitado em todos os 5 módulos pra todo
 * usuário MEMBER que já existe hoje, pra ninguém perder acesso no dia
 * da troca (requireModulePermission.ts só bloqueia quem não tem
 * registro ou tem enabled:false — sem backfill, todo MEMBER existente
 * ficaria bloqueado de tudo no deploy). Membros convidados depois desse
 * rollout nascem sem nenhum módulo liberado, até o OWNER/ADMIN conceder
 * — é o comportamento esperado da feature, não um bug.
 *
 * Uso: npm run backfill:module-permissions (rodar manualmente uma vez
 * após o deploy que introduziu o model ModulePermission — idempotente,
 * pode rodar de novo sem duplicar nada).
 */
import { OrgModule } from '@prisma/client'
import { prisma } from '../src/config/prisma'

const ALL_MODULES = Object.values(OrgModule)

async function main() {
  const members = await prisma.user.findMany({
    where: { orgRole: 'MEMBER' },
    select: { id: true, organizationId: true, email: true },
  })

  console.log(`🔔 ${members.length} usuário(s) MEMBER encontrado(s) para backfill`)

  let created = 0
  for (const member of members) {
    for (const module of ALL_MODULES) {
      await prisma.modulePermission.upsert({
        where: { userId_module: { userId: member.id, module } },
        update: {},
        create: {
          organizationId: member.organizationId,
          userId: member.id,
          module,
          enabled: true,
        },
      })
      created += 1
    }
    console.log(`✅ Permissões garantidas para ${member.email}`)
  }

  console.log(`\n🎉 Backfill concluído — ${created} registro(s) de permissão garantido(s).`)
}

main()
  .catch((err) => {
    console.error('Erro ao rodar backfill de permissões:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
