import { useAsyncRetry } from 'react-use'
import { getAirdropQuatum } from '../apis'

export function useAirdropQuatum(address: string) {
  return useAsyncRetry(async () => {
    if (!address) return
    return getAirdropQuatum(address)
  }, [address])
}