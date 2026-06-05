import {
  AccountRole,
  address,
  type AccountMeta as KitAccountMeta,
  type Address,
  type Instruction,
} from "@solana/kit";

export type Web3AccountMeta = {
  pubkey: { toBase58(): string };
  isSigner: boolean;
  isWritable: boolean;
};

export function publicKeyToAddress(value: { toBase58(): string } | string): Address {
  return address(typeof value === "string" ? value : value.toBase58());
}

export function kitAccountMetaFromWeb3(
  meta: Web3AccountMeta
): KitAccountMeta<Address> {
  return {
    address: publicKeyToAddress(meta.pubkey),
    role: meta.isWritable
      ? meta.isSigner
        ? AccountRole.WRITABLE_SIGNER
        : AccountRole.WRITABLE
      : meta.isSigner
        ? AccountRole.READONLY_SIGNER
        : AccountRole.READONLY,
  };
}

export function appendRemainingAccounts<
  T extends { accounts?: readonly KitAccountMeta<Address>[] },
>(instruction: T, remainingAccounts: Web3AccountMeta[] = []): T {
  return {
    ...instruction,
    accounts: [
      ...(instruction.accounts ?? []),
      ...remainingAccounts.map(kitAccountMetaFromWeb3),
    ],
  };
}

export function instructionSummary(instruction: Instruction): {
  programAddress: Address;
  accounts: number;
  dataBytes: number;
} {
  return {
    programAddress: instruction.programAddress,
    accounts: instruction.accounts?.length ?? 0,
    dataBytes: instruction.data?.length ?? 0,
  };
}

