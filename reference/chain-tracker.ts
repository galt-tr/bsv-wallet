import { ChainTracker } from '@bsv/sdk'

interface ChainTracksResponse {
  status: 'success' | 'error'
  value?: any
  code?: string
  description?: string
}

/**
 * Custom ChainTracker with fallback support
 * Primary: arcade-us-1.bsvb.tech (or configured)
 * Fallback: mainnet-chaintracks.babbage.systems
 */
export class FallbackChainTracker implements ChainTracker {
  private primaryUrl: string
  private fallbackUrl: string
  private cache: Map<number, string> = new Map()
  private useFallback = false

  constructor(primaryUrl: string, fallbackUrl: string) {
    this.primaryUrl = primaryUrl
    this.fallbackUrl = fallbackUrl
  }

  private getActiveUrl(): string {
    return this.useFallback ? this.fallbackUrl : this.primaryUrl
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const urls = [this.primaryUrl, this.fallbackUrl]
    const startIndex = this.useFallback ? 1 : 0

    for (let i = 0; i < urls.length; i++) {
      const urlIndex = (startIndex + i) % urls.length
      const url = urls[urlIndex]
      
      try {
        const response = await fetch(`${url}${endpoint}`)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        
        const data: ChainTracksResponse = await response.json()
        
        if (data.status === 'error') {
          throw new Error(data.description || 'ChainTracks error')
        }
        
        // If we successfully used fallback, stay on it
        if (urlIndex === 1 && !this.useFallback) {
          console.error(`[ChainTracker] Primary failed, switching to fallback: ${this.fallbackUrl}`)
          this.useFallback = true
        }
        
        return data.value as T
      } catch (err) {
        if (i === urls.length - 1) {
          throw err
        }
        // Try next URL
      }
    }
    
    throw new Error('All ChainTracks endpoints failed')
  }

  async currentHeight(): Promise<number> {
    const info = await this.fetch<{ heightLive: number }>('/getInfo')
    return info.heightLive
  }

  async isValidRootForHeight(root: string, height: number): Promise<boolean> {
    // Check cache first
    const cached = this.cache.get(height)
    if (cached) {
      return cached === root
    }

    try {
      const headerHex = await this.fetch<string>(`/findHeaderHexForHeight?height=${height}`)
      
      if (!headerHex) {
        return false
      }

      // Block header is 80 bytes (160 hex chars)
      // Merkle root is bytes 36-68 (chars 72-136)
      const merkleRoot = headerHex.slice(72, 136)
      
      // Cache the result
      this.cache.set(height, merkleRoot)
      
      return merkleRoot === root
    } catch {
      return false
    }
  }

  async getHeaderForHeight(height: number): Promise<string | null> {
    try {
      return await this.fetch<string>(`/findHeaderHexForHeight?height=${height}`)
    } catch {
      return null
    }
  }

  getStatus(): { primary: string; fallback: string; usingFallback: boolean } {
    return {
      primary: this.primaryUrl,
      fallback: this.fallbackUrl,
      usingFallback: this.useFallback
    }
  }
}
