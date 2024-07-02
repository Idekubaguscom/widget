import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import type { StdFee } from "@cosmjs/amino"
import type { AccountData, OfflineSigner } from "@cosmjs/proto-signing"
import type { DeliverTxResponse } from "@cosmjs/stargate"
import { SigningStargateClient } from "@cosmjs/stargate"
import { HttpClient, Comet38Client } from "@cosmjs/tendermint-rpc"
import { sleep } from "@cosmjs/utils"
import type { TxBodyValue } from "@initia/utils"
import { TimeoutError, createAminoTypes, createRegistry, defined, getRPC } from "@initia/utils"
import type { Chain } from "@initia/initia-registry-types"

const registry = createRegistry()
const aminoTypes = createAminoTypes()

export default abstract class BaseSigner {
  protected abstract getOfflineSigner(): Promise<OfflineSigner>

  protected offlineSigner?: OfflineSigner
  stargateClient?: SigningStargateClient

  constructor(protected chain: Chain) {}

  async getAccount(): Promise<AccountData> {
    defined(this.offlineSigner)
    const [account] = await this.offlineSigner.getAccounts()
    return account
  }

  async getAddress(): Promise<string> {
    const { address } = await this.getAccount()
    return address
  }

  protected async getSigningClient(): Promise<SigningStargateClient> {
    if (!this.stargateClient) {
      await this.connect()
      defined(this.offlineSigner, "Offline signer not initialized")
      const options = { registry, aminoTypes }
      const cometClient = await Comet38Client.create(new HttpClient(getRPC(this.chain)))
      this.stargateClient = await SigningStargateClient.createWithSigner(cometClient, this.offlineSigner, options)
    }

    return this.stargateClient
  }

  async connect(): Promise<void> {
    this.offlineSigner = await this.getOfflineSigner()
  }

  async disconnect(): Promise<void> {
    this.offlineSigner = undefined
  }

  async estimateGas({ messages, memo }: TxBodyValue): Promise<number> {
    const signingClient = await this.getSigningClient()
    const address = await this.getAddress()
    return signingClient.simulate(address, messages, memo)
  }

  async signTx({ messages, memo = "" }: TxBodyValue, fee: StdFee): Promise<TxRaw> {
    const signingClient = await this.getSigningClient()
    const address = await this.getAddress()
    return signingClient.sign(address, messages, fee, memo)
  }

  async broadcastTx(txRaw: TxRaw): Promise<string> {
    const signingClient = await this.getSigningClient()
    return await signingClient.broadcastTxSync(TxRaw.encode(txRaw).finish())
  }

  async pollTx(transactionHash: string, maxRetries: number = 300): Promise<DeliverTxResponse> {
    const signingClient = await this.getSigningClient()

    let retries = 0

    while (retries < maxRetries) {
      const result = await signingClient.getTx(transactionHash)

      if (result) {
        if (result.code !== 0) {
          throw new Error(result.rawLog)
        }

        return {
          code: result.code,
          height: result.height,
          txIndex: result.txIndex,
          events: result.events,
          rawLog: result.rawLog,
          transactionHash: transactionHash,
          gasUsed: result.gasUsed,
          gasWanted: result.gasWanted,
        } as DeliverTxResponse
      }

      retries++
      await sleep(1000)
    }

    throw new TimeoutError(transactionHash)
  }

  async signAndBroadcastTx(txBodyValue: TxBodyValue, fee: StdFee, mode: "sync" | "block" = "block"): Promise<string> {
    const tx = await this.signTx(txBodyValue, fee)
    const transactionHash = await this.broadcastTx(tx)
    if (mode === "sync") return transactionHash
    await this.pollTx(transactionHash)
    return transactionHash
  }

  abstract signArbitrary(data: string | Uint8Array): Promise<string>
  abstract verifyArbitrary(data: string | Uint8Array, signature: string): Promise<boolean>
}