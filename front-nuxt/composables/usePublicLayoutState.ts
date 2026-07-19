export const usePublicLayoutState = () => {
  const itemTotalLabel = useState<string>('public-layout-item-total-label', () => '待同步')

  return {
    itemTotalLabel,
  }
}
