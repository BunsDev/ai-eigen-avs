import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { anvil } from 'viem/chains';
import 'dotenv/config';

if (!process.env.PRIVATE_KEY) {
  throw new Error('PRIVATE_KEY not found in environment variables');
}

type Task = {
  contents: string;
  taskCreatedBlock: number;
};

const abi = parseAbi([
  'function createNewTask(string memory contents) external returns ((string contents, uint32 taskCreatedBlock))'
]);

async function main() {
  const contractAddress = '0xb60971942E4528A811D24826768Bc91ad1383D21'

  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

  const publicClient = createPublicClient({
    chain: anvil,
    transport: http('http://localhost:8545'),
  });

  const walletClient = createWalletClient({
    chain: anvil,
    transport: http('http://localhost:8545'),
    account,
  });

  try {
    const { request } = await publicClient.simulateContract({
      address: contractAddress,
      abi,
      functionName: 'createNewTask',
      args: ['I wanna rob a bank!'],
      account: account.address,
    });

    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('Transaction hash:', hash);
    console.log('Transaction receipt:', receipt);
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
