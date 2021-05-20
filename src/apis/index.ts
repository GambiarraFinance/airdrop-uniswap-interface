export interface AirdropQuatum {
  address: string
  index: string
  amount: string
  proof: string[]
}

export async function getAirdropQuatum(address: string) {
  try {
    const response = await fetch(`https://localhost:7700/user/${address}`, {
      method: 'GET',
    })

    return (await response.json()) as AirdropQuatum
  } catch (e) {
    return
  }
}
