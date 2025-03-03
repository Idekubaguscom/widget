import { fromBase64, fromHex } from '@cosmjs/encoding';
import { makeAuthInfoBytes, makeSignBytes, makeSignDoc, Registry, TxBodyEncodeObject } from '@cosmjs/proto-signing';

import { AbstractWallet, Account, IChain, WalletArgument, WalletName, keyType } from '../Wallet';
import { Transaction, TxResponse } from '../../utils/type';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { Any } from 'cosmjs-types/google/protobuf/any';
import { PubKey } from 'cosmjs-types/cosmos/crypto/secp256k1/keys';
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing';
import { AminoTypes, createDefaultAminoConverters, createIbcAminoConverters } from '@cosmjs/stargate';
import { makeSignDoc as makeSignDocAmino } from '@cosmjs/amino';
import { createWasmAminoConverters } from '@cosmjs/cosmwasm-stargate';
import { Buffer } from 'buffer';
import { TimeoutError, createAminoTypes, createRegistry, defined, getRPC } from "@initia/utils"
import { serializeSignDoc } from '@cosmjs/amino/build/signdoc';
import { Signature } from '@initia/initia.js';
declare global {
  interface Window {
      initia: any; // Adjust the type as needed
  }
}
export class InitiaWallet implements AbstractWallet {
  name: WalletName.Initia = WalletName.Initia;
  chainId: string;
  chain: IChain;
  registry: Registry;
  conf: WalletArgument;
  aminoTypes: any;
  wallet: any;
  connectEventNamesOnWindow: string[] = [];
  createAminoConverters = createAminoTypes()
  constructor(arg: WalletArgument, chain: IChain, registry: Registry) {
    this.chainId = arg.chainId || "cosmoshub";
    this.aminoTypes = createAminoTypes();
    // @ts-ignore

    this.registry = createRegistry();
    this.conf = arg;
    this.chain = chain;
    this.wallet = window.initia;
  }
  async getAccounts(): Promise<Account[]> {
    // const chainId = 'cosmoshub'
    // @ts-ignore
    await this.wallet.getOfflineSigner(this.chainId)
    // @ts-ignore
    const offlineSigner = this.wallet.getOfflineSigner(this.chainId)
    return offlineSigner.getAccounts()
}
  supportCoinType(): Promise<boolean> {
    return Promise.resolve(true);
  }

  isEthermint() {
    return this.conf.hdPath && this.conf.hdPath.startsWith("m/44'/60");
  }
  // @deprecated use signAmino instead
  // because signDirect is not supported ledger wallet
  async sign(transaction: Transaction): Promise<TxResponse> {
    const accouts = await this.getAccounts();

    const accountFromSigner = accouts[0];
    if (!accountFromSigner) {
      throw new Error("Failed to retrieve account from signer");
    }
    const pubkey = Any.fromPartial({
        typeUrl: keyType(transaction.chainId),
        value: PubKey.encode({
            key: accountFromSigner.pubkey,
        }).finish()
    })

    const txBodyEncodeObject: TxBodyEncodeObject = {
      typeUrl: "/cosmos.tx.v1beta1.TxBody",
      value: {
        messages: transaction.messages,
        memo: transaction.memo,
      },
    };

    const txBodyBytes = this.registry.encode(txBodyEncodeObject);
    console.log("txBodyBytes: ", this.registry);
    const gasLimit = Number(transaction.fee.gas);
    const authInfoBytes = makeAuthInfoBytes(
      [{ pubkey, sequence: transaction.signerData.sequence }],
      transaction.fee.amount,
      gasLimit,
      transaction.fee.granter,
      transaction.fee.payer
    );

    const signDoc = makeSignDoc(
      txBodyBytes,
      authInfoBytes,
      transaction.chainId,
      transaction.signerData.accountNumber
    );
    console.log("signDoc: ", signDoc);

    const signDocBuffer = makeSignBytes(signDoc);

    const signString = new TextDecoder().decode(signDocBuffer);

    // @ts-ignore
    const signature = await this.wallet.signAndBroadcastBlock(this.chainId, txBodyBytes, gasLimit);
    console.log("result22: ", signature);

    const signed = signDoc;
    console.log("signed: ", signed);
    const res: TxResponse = {
      txhash: signature.transactionHash,
      codespace: signature.codespace,
      code: signature.code,
      raw_log: signature.rawLog,
      height: signature.height,
      data: signature.data,
  //    bodyBytes: signed.bodyBytes,
   //   authInfoBytes: signed.authInfoBytes,
   //   signatures: [fromBase64(signature)],
    };
    return res
  }

  async signAmino(tx: Transaction): Promise<TxRaw> {
    const accouts = await this.getAccounts();

    const accountFromSigner = accouts[0];
    if (!accountFromSigner) {
      throw new Error("Failed to retrieve account from signer");
    }
    const pubkey = Any.fromPartial({
        typeUrl: keyType(tx.chainId),
        value: PubKey.encode({
            key: accountFromSigner.pubkey,
        }).finish()
    });

    const signMode = SignMode.SIGN_MODE_LEGACY_AMINO_JSON;
    const msgs = tx.messages.map((msg) => this.aminoTypes.toAmino(msg));
    const signDoc = makeSignDocAmino(
      msgs,
      tx.fee,
      tx.chainId,
      tx.memo,
      tx.signerData.accountNumber,
      tx.signerData.sequence
    );

    const signed = signDoc;

    const signDocBuffer = serializeSignDoc(signDoc);

    const signString = Buffer.from(signDocBuffer).toString();

    // @ts-ignore

    const signature = await window.initia.signArbitrary(signString);
    console.log("signature: ", signature);

    const signedTxBody = {
      messages: signed.msgs.map((msg) => this.aminoTypes.fromAmino(msg)),
      memo: signed.memo,
    };

    const signedTxBodyEncodeObject: TxBodyEncodeObject = {
      typeUrl: "/cosmos.tx.v1beta1.TxBody",
      value: signedTxBody,
    };

    const signedTxBodyBytes = this.registry.encode(signedTxBodyEncodeObject);

    const signedGasLimit = Number(signed.fee.gas);
    const signedSequence = Number(signed.sequence);
    const signedAuthInfoBytes = makeAuthInfoBytes(
      [{ pubkey, sequence: signedSequence }],
      signed.fee.amount,
      signedGasLimit,
      signed.fee.granter,
      signed.fee.payer,
      signMode
    );

    return TxRaw.fromPartial({
      bodyBytes: signedTxBodyBytes,
      authInfoBytes: signedAuthInfoBytes,
      signatures: [fromBase64(signature)],
    });
  }
}
