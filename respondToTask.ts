import { createPublicClient, createWalletClient, http, parseAbi, encodePacked, keccak256, parseAbiItem, AbiEvent } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { anvil } from 'viem/chains';
import ollama from 'ollama';
import 'dotenv/config';

if (!process.env.OPERATOR_PRIVATE_KEY) {
  throw new Error('OPERATOR_PRIVATE_KEY not found in environment variables');
}

type Task = {
  contents: string;
  taskCreatedBlock: number;
};

const abi = parseAbi([
  'function respondToTask((string contents, uint32 taskCreatedBlock) task, uint32 referenceTaskIndex, bool isSafe, bytes memory signature) external',
  'event NewTaskCreated(uint32 indexed taskIndex, (string contents, uint32 taskCreatedBlock) task)'
]);

async function createSignature(account: any, isSafe: boolean, contents: string) {
  // Recreate the same message hash that the contract uses
  const messageHash = keccak256(
    encodePacked(
      ['bool', 'string'],
      [isSafe, contents]
    )
  );

  // Sign the message hash
  const signature = await account.signMessage({
    message: { raw: messageHash }
  });

  return signature;
}

async function respondToTask(
  walletClient: any,
  publicClient: any,
  contractAddress: string,
  account: any,
  task: Task,
  taskIndex: number
) {
  try {
    const response = await ollama.chat({
      model: 'llama-guard3:1b',
      messages: [{ role: 'user', 'content': task.contents }]
    })

    let isSafe = true;
    if (response.message.content.includes('unsafe')) {
      isSafe = false
    }

    const signature = await createSignature(account, isSafe, task.contents);

    const { request } = await publicClient.simulateContract({
      address: contractAddress,
      abi,
      functionName: 'respondToTask',
      args: [task, taskIndex, isSafe, signature],
      account: account.address,
    });

    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('Responded to task:', {
      taskIndex,
      task,
      isSafe,
      transactionHash: hash
    });
  } catch (error) {
    console.error('Error responding to task:', error);
  }
}

async function main() {
  const contractAddress = '0xb60971942E4528A811D24826768Bc91ad1383D21';

  const account = privateKeyToAccount(process.env.OPERATOR_PRIVATE_KEY as `0x${string}`);

  const publicClient = createPublicClient({
    chain: anvil,
    transport: http('http://localhost:8545'),
  });

  const walletClient = createWalletClient({
    chain: anvil,
    transport: http('http://localhost:8545'),
    account,
  });

  console.log('Starting to watch for new tasks...');
  publicClient.watchEvent({
    address: contractAddress,
    event: parseAbiItem('event NewTaskCreated(uint32 indexed taskIndex, (string contents, uint32 taskCreatedBlock) task)') as AbiEvent,
    onLogs: async (logs) => {
      for (const log of logs) {
        const { args } = log;
        if (!args) continue;

        const taskIndex = Number(args.taskIndex);
        const task = args.task as Task;

        console.log('New task detected:', {
          taskIndex,
          task
        });

        await respondToTask(
          walletClient,
          publicClient,
          contractAddress,
          account,
          task,
          taskIndex
        );
      }
    },
  });

  process.on('SIGINT', () => {
    console.log('Stopping task watcher...');
    process.exit();
  });

  await new Promise(() => { });
}

main().catch(console.error);
