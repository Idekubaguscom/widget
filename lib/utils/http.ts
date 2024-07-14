import fetch from 'cross-fetch'
import { Coin, CoinMetadata, TxResponse } from './type'

export async function get(url: string) {
    return (await fetch(url)).json()
}

export async function post(url: string, data: any) {
    const response = await fetch(url, {
        method: 'POST', // *GET, POST, PUT, DELETE, etc.
        // mode: 'cors', // no-cors, *cors, same-origin
        // credentials: 'same-origin', // redirect: 'follow', // manual, *follow, error
        // referrerPolicy: 'origin', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
        headers: {
          'Content-Type': 'text/plain',
          Accept: '*/*',
          // 'Accept-Encoding': 'gzip, deflate, br',
        },
        body: JSON.stringify(data), // body data type must match "Content-Type" header
      })
      // const response = axios.post((config ? config.api : this.config.api) + url, data)
      return response.json() // parses JSON response into native JavaScript objects
}

//let returnvalue = getLatestBlock(`$endpoint`);

function isInitiaChain(endpoint: string): boolean {
    return endpoint.indexOf("init") !== -1;
}

function findField(obj: any, name: string) {

    if(!obj) return undefined

    const list = Object.keys(obj).filter(x => x && !x.startsWith("@"))
    if(list.includes(name)) {
        return obj[name]
    }
    for(let i = 0; i < list.length; i++) {
        const field = obj[list[i]]
        if(typeof field === 'string') continue
        if(Array.isArray(field)) continue

        const sub = findField(field, name)
        if(sub) return sub
    }
    return undefined
}

export async function getEndpoint(endpoint: string){
    const url = `${endpoint}`
    return get(url)
}

export async function getLatestBlock(endpoint: string){
    const url = `${endpoint}/cosmos/base/tendermint/v1beta1/blocks/latest`
    return get(url)
}

export async function getAccount(endpoint: string, address: string) {
    const url = `${endpoint}/cosmos/auth/v1beta1/accounts/${address}`
    try{
        const res = await get(url)
        return {
            account: {
                account_number: findField(res, "account_number"),
                sequence: findField(res, "sequence")
            }
        }      
    }catch(err) {
        throw new Error(err)
    }

}

export async function getBalance(endpoint: string, address: string): Promise<{balances: Coin[]}> {
    const url = `${endpoint}/cosmos/bank/v1beta1/balances/${address}`
    return get(url)
}

export async function getBalanceMetadata(endpoint: string, denom: string): Promise<{metadata: CoinMetadata }> {
    const url = `${endpoint}/cosmos/bank/v1beta1/denoms_metadata/${denom}`
    return get(url)
}

export async function getIBCDenomMetadata(denom: string): Promise<CoinMetadata> {
    const url = `https://metadata.ping.pub/metadata/${denom.replace("ibc/", "")}`
    return get(url)
}

export async function getCoinMetadata(endpoint: string, denom: string) {
    const url = `${endpoint}/cosmos/bank/v1beta1/denoms_metadata/${denom}`
    return get(url)
}
export async function getInitiaMetadata(endpoint: string, denom: string) {
    const url = `${endpoint}/initia/move/v1/metadata?denom=${denom}`
    return get(url)
}

export async function getDelegateRewards(endpoint: string, address: string) {
    const url = `${endpoint}/cosmos/distribution/v1beta1/delegators/${address}/rewards`
    return get(url)
}

export async function getDelegations(endpoint: string, validator_addr: string, address: string): Promise<{
    delegation_response: {
        balance: Coin | Coin[],
        delegation: {
            delegator_address: string,
            shares: string,
            validator_address: string
        }
    }
}> {
    const baseUrl = isInitiaChain(endpoint)
        ? `${endpoint}/initia/mstaking/v1/validators`
        : `${endpoint}/cosmos/staking/v1beta1/validators`;
    
    const url = `${baseUrl}/${validator_addr}/delegations/${address}`;
    const response = await get(url);

    // Adjust balance type based on initia condition
    if (isInitiaChain(endpoint)) {
        response.delegation_response.balance = Array.isArray(response.delegation_response.balance)
            ? response.delegation_response.balance
            : [response.delegation_response.balance];
    }

    return response;
}


export async function getActiveValidators(endpoint: string) {
    const baseUrl = isInitiaChain(endpoint)
        ? `${endpoint}/initia/mstaking/v1/validators`
        : `${endpoint}/cosmos/staking/v1beta1/validators`;
    
    const url = `${baseUrl}?pagination.limit=300&status=BOND_STATUS_BONDED`;
    return get(url);
}


export async function getInactiveValidators(endpoint: string) {
    const baseUrl = isInitiaChain(endpoint)
        ? `${endpoint}/initia/mstaking/v1/validators`
        : `${endpoint}/cosmos/staking/v1beta1/validators`;
    
    const url = `${baseUrl}?pagination.limit=300&status=BOND_STATUS_UNBONDED`;
    return get(url);
}

// /ibc/apps/transfer/v1/denom_traces/{hash}
export async function getDenomTraces(endpoint: string, hash: string) : Promise<{
    denom_trace: {
        path: string;
        base_denom: string;
    };
}> {
    const url = `${endpoint}/ibc/apps/transfer/v1beta1/denom_traces/${hash}`
    return get(url)
}
// /cosmos/tx/v1beta1/txs/{hash}
export async function getTxByHash(endpoint: string, hash: string) : Promise<{
    tx_response: TxResponse;
}> {
    const url = `${endpoint}/cosmos/tx/v1beta1/txs/${hash}`
    return get(url)
}
// /cosmos/staking/v1beta1/params

// /initia/mstaking/v1/params

export async function getStakingParam(endpoint: string): Promise<{
    params: {
        unbonding_time: string;
        max_validators: number;
        max_entries: number;
        historical_entries: number;
        bond_denom?: string;
        bond_denoms?: string[];
        min_voting_power: string;
        min_commission_rate: string;
    }
}> {
    const initia = isInitiaChain(endpoint);
    const url = initia 
        ? `${endpoint}/initia/mstaking/v1/params`
        : `${endpoint}/cosmos/staking/v1beta1/params`;
    const response = await get(url);
    
    if (initia) {
        const bondDenomsArray = Array.isArray(response.params.bond_denom) 
            ? response.params.bond_denom 
            : [response.params.bond_denom];
        
        // Ensure "uinit" is in the bond_denoms array
        if (!bondDenomsArray.includes("uinit")) {
            bondDenomsArray.unshift("uinit");
        }
        
        response.params.bond_denoms = bondDenomsArray;
        response.params.bond_denom = bondDenomsArray[0];
    } else {
        // Ensure bond_denom is a string
        if (Array.isArray(response.params.bond_denom)) {
            response.params.bond_denom = response.params.bond_denom[0];
        }
    }
    
    return response;
}


export async function getOsmosisPools(endpoint: string) {
    const url = `${endpoint}/osmosis/gamm/v1beta1/pools?pagination.limit=1000`
    return get(url)
}
// https://lcd.osmosis.zone
// /osmosis/gamm/v1beta1/{pool_id}/estimate/swap_exact_amount_in
export async function estimateSwapAmountIn(endpoint: string, poolId: string, token: Coin) {
    const url = `${endpoint}/osmosis/gamm/v1beta1/${poolId}/estimate/swap_exact_amount_in?token_in=${token.amount}${token.denom}`
    return get(url)
}