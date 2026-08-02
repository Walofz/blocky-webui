import net from 'net'

function uniqueProfiles(profiles: string[]): string[] {
  return Array.from(new Set(profiles))
}

function profileKey(profiles: string[]): string {
  return uniqueProfiles(profiles).slice().sort().join('\u0001')
}

function isIpv4Address(value: string): boolean {
  return net.isIP(value) === 4
}

function parseIpv4Cidr(value: string): { start: bigint; end: bigint } | null {
  const [ip, prefixText] = value.split('/')
  if (!ip || prefixText === undefined || net.isIP(ip.trim()) !== 4) {
    return null
  }

  const prefix = Number(prefixText)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return null
  }

  const base = ipv4ToBigInt(ip.trim())
  const hostBits = 32 - prefix
  const networkMask = prefix === 0 ? 0n : ((1n << 32n) - 1n) << BigInt(hostBits)
  const start = base & networkMask
  const end = start + (1n << BigInt(hostBits)) - 1n

  return { start, end }
}

function ipv4ToBigInt(value: string): bigint {
  return value.split('.').reduce((accumulator, part) => (accumulator << 8n) + BigInt(Number(part)), 0n)
}

function bigIntToIpv4(value: bigint): string {
  return [24n, 16n, 8n, 0n]
    .map((shift) => Number((value >> shift) & 255n))
    .join('.')
}

function highestPowerOfTwoLE(value: bigint): bigint {
  let blockSize = 1n
  while ((blockSize << 1n) <= value) {
    blockSize <<= 1n
  }
  return blockSize
}

function ipv4RangeToCidrs(start: bigint, end: bigint): string[] {
  const result: string[] = []
  const maxAddressSpace = 1n << 32n
  let cursor = start

  while (cursor <= end) {
    let alignedBlock = 1n
    while (alignedBlock < maxAddressSpace && cursor % (alignedBlock << 1n) === 0n) {
      alignedBlock <<= 1n
    }

    const remaining = end - cursor + 1n
    const blockSize = alignedBlock > remaining ? highestPowerOfTwoLE(remaining) : alignedBlock
    const prefix = 32 - (blockSize.toString(2).length - 1)

    result.push(`${bigIntToIpv4(cursor)}/${prefix}`)
    cursor += blockSize
  }

  return result
}

function subtractIpv4PointsFromCidr(cidr: string, exclusions: bigint[]): string[] {
  const parsed = parseIpv4Cidr(cidr)
  if (!parsed) {
    return [cidr]
  }

  const points = Array.from(new Set(exclusions.filter((point) => point >= parsed.start && point <= parsed.end))).sort(
    (left, right) => (left < right ? -1 : left > right ? 1 : 0),
  )

  if (points.length === 0) {
    return [cidr]
  }

  const result: string[] = []
  let cursor = parsed.start

  for (const point of points) {
    if (cursor <= point - 1n) {
      result.push(...ipv4RangeToCidrs(cursor, point - 1n))
    }
    cursor = point + 1n
  }

  if (cursor <= parsed.end) {
    result.push(...ipv4RangeToCidrs(cursor, parsed.end))
  }

  return result
}

export function normalizeClientGroupsBlock(clientGroupsBlock: Record<string, string[]>): Record<string, string[]> {
  const exactIpv4Profiles = new Map<string, string[]>()
  const cidrEntries: Array<{ identifier: string; profiles: string[] }> = []
  const passthroughEntries: Array<[string, string[]]> = []

  for (const [identifier, profiles] of Object.entries(clientGroupsBlock)) {
    const trimmedIdentifier = identifier.trim()

    if (isIpv4Address(trimmedIdentifier)) {
      exactIpv4Profiles.set(trimmedIdentifier, profiles)
      continue
    }

    if (parseIpv4Cidr(trimmedIdentifier)) {
      cidrEntries.push({ identifier: trimmedIdentifier, profiles })
      continue
    }

    passthroughEntries.push([identifier, profiles])
  }

  const normalized: Record<string, string[]> = {}

  for (const [identifier, profiles] of passthroughEntries) {
    normalized[identifier] = [...profiles]
  }

  for (const [identifier, profiles] of exactIpv4Profiles.entries()) {
    normalized[identifier] = [...profiles]
  }

  for (const { identifier, profiles } of cidrEntries) {
    const cidrProfilesKey = profileKey(profiles)
    const exclusions = Array.from(exactIpv4Profiles.entries())
      .filter(([, ipProfiles]) => profileKey(ipProfiles) !== cidrProfilesKey)
      .map(([ip]) => ipv4ToBigInt(ip))

    const splitCidrs = subtractIpv4PointsFromCidr(identifier, exclusions)

    for (const splitCidr of splitCidrs) {
      normalized[splitCidr] = [...profiles]
    }
  }

  return normalized
}