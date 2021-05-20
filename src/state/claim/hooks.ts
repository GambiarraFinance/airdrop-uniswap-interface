import { CFXQ } from './../../constants/index'
import { JSBI } from '@uniswap/v2-sdk'
import { TokenAmount, ChainId } from '@uniswap/sdk-core'
import { TransactionResponse } from '@ethersproject/providers'
import { useEffect, useState } from 'react'
import { useActiveWeb3React } from '../../hooks'
import { useMerkleDistributorContract } from '../../hooks/useContract'
import { useSingleCallResult } from '../multicall/hooks'
import { calculateGasMargin, isAddress } from '../../utils'
import { useTransactionAdder } from '../transactions/hooks'

interface UserClaimData {
  index: number
  amount: number
  proof: string[]
  address: string
}

// const CLAIM_PROMISES: { [key: string]: Promise<UserClaimData | null> } = {}

const CLAIM_CFX: { [address: string]: Promise<UserClaimData | null> } = {}

// returns the claim for the given address, or null if not valid
// this data coming
function fetchClaim(account: string, chainId: ChainId): Promise<UserClaimData | null> {
  const formatted = isAddress(account)
  if (!formatted) return Promise.reject(new Error('Invalid address'))
  const key = `${chainId}:${account}`
  const accountCFX = account
  return (CLAIM_CFX[accountCFX] =
    CLAIM_CFX[accountCFX] ??
    fetch(`http://localhost:7700/user/${formatted}`)
      .then((res) => (res.ok ? res.json() : console.log(`No claim for account ${formatted} on chain ID ${chainId}`)))
      .catch((error) => console.error('Failed to get claim data', error)))
}

// parse distributorContract blob and detect if user has claim data
// null means we know it does not
export function useUserClaimData(account: string | null | undefined): UserClaimData | null | undefined {
  const { chainId } = useActiveWeb3React()

  // const key = `${chainId}:${account}`
  const accountCFX = account
  const [claimInfo, setClaimInfo] = useState<{ [account: string]: UserClaimData | null }>({})

  useEffect(() => {
    if (!account || !chainId) return
    fetchClaim(account, chainId).then((accountClaimInfo) =>
      setClaimInfo((claimInfo) => {
        return {
          ...claimInfo,
          [account]: accountClaimInfo,
        }
      })
    )
  }, [account, chainId])

  return account && chainId ? claimInfo[account] : undefined
}

// check if user is in blob and has not yet claimed CFX
export function useUserHasAvailableClaim(account: string | null | undefined): boolean {
  const userClaimData = useUserClaimData(account)
  const distributorContract = useMerkleDistributorContract()
  const isCheckClaimed = useSingleCallResult(distributorContract, 'check', [
    userClaimData?.index,
    userClaimData?.address,
    userClaimData?.amount,
    userClaimData?.proof,
  ])

  // const isCheckClaimed = useSingleCallResult(distributorContract, 'check', [account, userClaimData?.index])
  // user is in blob and contract marks as unclaimed
  return Boolean(userClaimData && !isCheckClaimed.loading && isCheckClaimed.result?.available === true)
}

export function useUserUnclaimedAmount(account: string | null | undefined): TokenAmount | undefined {
  const { chainId } = useActiveWeb3React()
  const userClaimData = useUserClaimData(account)
  const canClaim = useUserHasAvailableClaim(account)

  const cfxq = chainId ? CFXQ[chainId] : undefined
  if (!cfxq) return undefined
  if (!canClaim || !userClaimData) {
    return new TokenAmount(cfxq, JSBI.BigInt(0))
  }
  return new TokenAmount(cfxq, JSBI.BigInt(userClaimData?.amount))
}

export function useClaimCallback(
  account: string | null | undefined
): {
  claimCallback: () => Promise<string>
} {
  // get claim data for this account
  const { library, chainId } = useActiveWeb3React()
  const claimData = useUserClaimData(account)

  // used for popup summary
  const unclaimedAmount: TokenAmount | undefined = useUserUnclaimedAmount(account)
  console.log(unclaimedAmount)
  const addTransaction = useTransactionAdder()
  const distributorContract = useMerkleDistributorContract()

  const claimCallback = async function () {
    if (!claimData || !account || !library || !chainId || !distributorContract) return

    const args = [claimData.index, claimData.amount, claimData.proof]

    return distributorContract.estimateGas['claim'](...args, {}).then((estimatedGasLimit) => {
      return distributorContract
        .claim(...args, { value: null, gasLimit: calculateGasMargin(estimatedGasLimit) })
        .then((response: TransactionResponse) => {
          addTransaction(response, {
            summary: `Claimed ${unclaimedAmount?.toSignificant(4)} CFXQ`,
            claim: { recipient: account },
          })
          return response.hash
        })
    })
  }

  return { claimCallback }
}
