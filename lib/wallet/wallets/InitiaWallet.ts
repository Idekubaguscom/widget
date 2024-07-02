import { fromBase64, fromBech32, toHex } from "@cosmjs/encoding";
import { Registry, TxBodyEncodeObject, encodePubkey, makeAuthInfoBytes, makeSignDoc } from "@cosmjs/proto-signing"
import { AbstractWallet, IChain, Account, WalletArgument, WalletName, keyType } from "../Wallet"
import { Transaction } from "../../utils/type"
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { Any } from "cosmjs-types/google/protobuf/any";
import { PubKey } from 'cosmjs-types/cosmos/crypto/secp256k1/keys'
import { SignMode } from "cosmjs-types/cosmos/tx/signing/v1beta1/signing";
import { AminoTypes, createDefaultAminoConverters } from "@cosmjs/stargate";
import { encodeSecp256k1Pubkey, makeSignDoc as makeSignDocAmino } from "@cosmjs/amino";
import { createWasmAminoConverters } from "@cosmjs/cosmwasm-stargate";
//import {requestInitiaTx, requestTx} from "@initia/wallet-widget";
import type { Msg } from "@initia/initia.js";
import type { RequestTxOptions, TxBodyValue } from "@initia/utils";
import type { InitiaWallet } from "@initia/utils";
import BaseSigner from "./base/BaseSigner";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { Chain } from "@initia/initia-registry-types"
declare global {
    interface Window {
        initia: any; // Adjust the type as needed
    }
}

export class InitiaSigner extends BaseSigner implements AbstractWallet {
    wallet: InitiaWallet
    name: WalletName.Initia
    chainId: string
    registry: Registry
    conf: WalletArgument
    aminoTypes = new AminoTypes( {...createDefaultAminoConverters(), ...createWasmAminoConverters()})
    constructor(arg: WalletArgument, registry: Registry, chain: IChain) {
        super(chain as unknown as Chain) // Pass the chain argument to the super constructor
        this.chainId = arg.chainId || "initia"
        // @ts-ignore
        if (!window.getOfflineSigner || !window.initia) {
            throw new Error('Please install initia extension')
        }
        this.registry = registry
        this.conf = arg
        this.wallet = window.initia
    }
    
    async getAccounts(): Promise<Account[]> {
      // @ts-ignore
      const offlineSigner = window.initia.getOfflineSigner(this.chainId);
      const accounts = await offlineSigner.getAccounts();
      if (!accounts || accounts.length === 0) {
          throw new Error("No accounts found in Initia wallet");
      }
      return accounts;
  }

  protected async getOfflineSigner(): Promise<OfflineSigner> {
    await this.wallet.requestAddInitiaLayer(this.chain)
    return this.wallet.getOfflineSigner(this.chain.chain_id)
  }
  async signArbitrary(data: string | Uint8Array): Promise<string> {
    return this.wallet.signArbitrary(data)
  }
  async verifyArbitrary(data: string | Uint8Array, signature: string): Promise<boolean> {
    return this.wallet.verifyArbitrary(data, signature)
  }

  async broadcastTx(txRaw: TxRaw): Promise<string> {
    const signingClient = await this.getSigningClient()
    return await signingClient.broadcastTxSync(TxRaw.encode(txRaw).finish())
  }
    supportCoinType(coinType?: string | undefined): Promise<boolean> {
        return Promise.resolve(true);
    }
    isEthermint() {
        return this.conf.hdPath && this.conf.hdPath.startsWith("m/44'/60")
    }
    async sign(transaction: Transaction): Promise<any> {
        const dataToSign = JSON.stringify(transaction); // Adjust as needed
        const signature = await this.signArbitrary(dataToSign);
        return {
            ...transaction,
            signature,
        };
    } 

    // @deprecated use signAmino instead
    // because signDirect is not supported ledger wallet

}