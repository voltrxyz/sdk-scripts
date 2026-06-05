import type { KeyPairSigner } from "@solana/kit";
import type {
  BuiltOperation,
  ProcessResult,
  ScriptContext,
  TxMode,
} from "../types.js";
import { getAddressesByLookupTable } from "./lut.js";
import { sendAndConfirmOptimizedTx } from "./send.js";

export async function processOperation(args: {
  ctx: ScriptContext;
  payer: KeyPairSigner;
  operation: BuiltOperation;
  mode: TxMode;
}): Promise<ProcessResult> {
  const { ctx, mode, operation, payer } = args;

  switch (mode) {
    case "execute": {
      const lookupTables = operation.lookupTableAddresses?.length
        ? await getAddressesByLookupTable(operation.lookupTableAddresses, ctx.rpc)
        : {};
      const signature = await sendAndConfirmOptimizedTx(
        operation.instructions,
        ctx.rpcUrl,
        payer,
        lookupTables,
        operation.computeUnitLimit ?? null
      );
      console.log(`${operation.label} signature: ${signature}`);
      return { mode, signature };
    }

    case "print": {
      console.log(
        JSON.stringify(
          {
            label: operation.label,
            instructionCount: operation.instructions.length,
            lookupTableAddresses: operation.lookupTableAddresses ?? [],
          },
          null,
          2
        )
      );
      return { mode };
    }

    case "simulate":
    case "multisig":
      throw new Error(
        `${mode} mode is not implemented yet. Add it once in packages/core/src/tx/processor.ts.`
      );
  }
}

