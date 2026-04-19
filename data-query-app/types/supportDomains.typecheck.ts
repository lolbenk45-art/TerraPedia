import { useSupportDomainsStore } from '~/stores/supportDomains'

const supportDomains = useSupportDomainsStore()

supportDomains.gamePeriodOptions[0]?.label
supportDomains.worldContextOptions[0]?.contextType

const label: string = supportDomains.getGamePeriodLabel(1, 'fallback')
void label
