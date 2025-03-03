<script lang="ts" setup>
import { PropType, computed, onMounted, ref } from 'vue';
import { getDelegations } from '../../../utils/http'
import { Coin, CoinMetadata } from '../../../utils/type';
import { TokenUnitConverter } from '../../../utils/TokenUnitConverter';
import { MsgUndelegate } from "@initia/initia.proto/initia/mstaking/v1/tx"

const props = defineProps({
    endpoint: {type: String, required: true },
    sender: {type: String, required: true},
    metadata: Object as PropType<Record<string, CoinMetadata>>,
    params: String,
});

const params = computed(() => JSON.parse(props.params || "{}"))
const delegation = ref({} as {balance: Coin, delegation: {delegator_address: string, shares: string, validator_address: string}})
const amount = ref("")
const amountDenom = ref("")
const error = ref("")

function isInitiaChain(endpoint: string): boolean {
    return props.endpoint.indexOf("init") !== -1;
}

const msgs = computed(() => {
    const convert = new TokenUnitConverter(props.metadata);
    const baseAmount = convert.displayToBase(delegation.value.balance?.denom, {
        amount: String(amount.value),
        denom: amountDenom.value,
    });

    if (isInitiaChain(props.endpoint)) {
        return [
            {
                typeUrl: '/initia.mstaking.v1.MsgUndelegate',
                value: MsgUndelegate.fromPartial({
                    delegatorAddress: props.sender,
                    validatorAddress: params.value.validator_address,
                    amount: [baseAmount],
                }),
            },
        ];
    } else {
        return [
            {
                typeUrl: '/cosmos.staking.v1beta1.MsgUndelegate',
                value: {
                    delegatorAddress: props.sender,
                    validatorAddress: params.value.validator_address,
                    amount: baseAmount,
                },
            },
        ];
    }
});

const units = computed(() => {
    const denom = delegation.value.balance?.denom
    if(!props.metadata || !props.metadata[denom]) {
        amountDenom.value = denom
        return [{denom: denom, exponent: 0, aliases: []}]
    }
    const list = props.metadata[denom].denom_units.sort((a, b) => b.exponent - a.exponent)
    if(list.length > 0) amountDenom.value = list[0].denom
    return list
})

const isValid = computed(() => {
    let ok = true
    let error = ""
    if(!props.sender) {
        ok = false
        error = "Sender is empty"
    }
    if(!params.value.validator_address) {
        ok = false
        error = "Validator is empty"
    }
    if(!(Number(amount.value) > 0)) {
        ok = false
        error = "Amount should be great than 0"
    }
    return { ok, error }
})

function initial() {
    getDelegations(props.endpoint, params.value.validator_address, props.sender).then(x => {
        const balance = x.delegation_response.balance;
        if (isInitiaChain(props.endpoint)) {
            delegation.value = {
                balance: Array.isArray(balance) ? balance.find(b => b.denom === 'uinit') || { amount: "0", denom: "uinit" } : balance,
                delegation: { delegator_address: props.sender, shares: "", validator_address: params.value.validator_address }
            };
        } else {
            delegation.value = {
                balance: Array.isArray(balance) ? balance[0] || { amount: "0", denom: amountDenom.value } : balance,
                delegation: { delegator_address: props.sender, shares: "", validator_address: params.value.validator_address }
            };
        }
    }).catch(err => {
        error.value = err
    })  
}

const available = computed(() => {
    const convert = new TokenUnitConverter(props.metadata);
    const base = delegation.value?.balance || {amount: "", denom: ""}
    return {
        base,
        display: convert.baseToUnit(base, amountDenom.value),
    };
});

defineExpose({msgs, isValid, initial})
</script>
<template>
    <div>
        <div class="form-control">
            <label class="label">
                <span class="label-text">Sender</span>
            </label>
            <input :value="sender" type="text" class="text-gray-600 dark:text-white input border !border-gray-300 dark:!border-gray-600" />
        </div>
        <div class="form-control">
            <label class="label">
                <span class="label-text">Amount</span>
            </label>
            <label class="input-group">
                <input v-model="amount" type="number" :placeholder="`Avaiable: ${available.display?.amount}`" class="input border border-gray-300 dark:border-gray-600 w-full dark:text-white" />
                <select v-model="amountDenom" class="select select-bordered dark:text-white">
                    <option v-for="u in units">{{ u.denom }}</option>
                </select>
            </label>
        </div>
        <div class="text-error">{{ error }}</div>
    </div>
</template>