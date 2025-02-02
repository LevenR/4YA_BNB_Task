import { ethers, JsonRpcProvider } from 'ethers';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import { Level } from 'level';

dotenv.config();

if (!process.env.BTCB_STAKE_CONTRACT_ADDRESS || !process.env.RPC_URL || !process.env.API_TOKEN || !process.env.PELL_CONTRACT_ADDRESS || !process.env.STBTC_CONTRACT_ADDRESS) {
    console.error('Missing required environment variables.');
    process.exit(1);
}

const BTCB_STAKE_CONTRACT_ADDRESS = process.env.BTCB_STAKE_CONTRACT_ADDRESS!;
const PELL_CONTRACT_ADDRESS = process.env.PELL_CONTRACT_ADDRESS!;
const RPC_URL = process.env.RPC_URL!;
const API_TOKEN = process.env.API_TOKEN!;
const STBTC_CONTRACT_ADDRESS = process.env.STBTC_CONTRACT_ADDRESS!;
const START_TRACK_TIME = process.env.START_TRACK_TIME!;
const END_TRACK_TIME = process.env.END_TRACK_TIME!;

const BLOCK_FILE = 'last_processed_block.txt'; //record last process bolck number
const POLLING_INTERVAL = 10000; // 10 seconds

const API_URL = 'https://dapp-server.bnbchain.world/api/v1/redpack-campaign/upload-user'

const BTCB_STAKING_ABI = [
  "event StakeBTC2JoinStakePlan(uint256 indexed stakeIndex, uint256 indexed planId, address indexed user, address btcContractAddress, uint256 stakeAmount, uint256 stBTCAmount)"
];

const PELL_CONTRACT_ABI = [
    "event Deposit(address staker, address token, address strategy, uint256 shares)"
];

// 初始化 LevelDB，指定正确的类型
const db = new Level<string, TaskStatus>('./task-db', { valueEncoding: 'json' });

// 定义任务状态接口
interface TaskStatus {
    address: string;
    taskId: number;
    timestamp: number;
    uploaded: boolean;
}

async function getLastProcessedBlock(): Promise<number> {
    try {
      const blockNumber = await fs.promises.readFile(BLOCK_FILE, 'utf8');
      return parseInt(blockNumber.trim(), 10);
    } catch (error) {
      return 0; // Start from block 0 if file doesn't exist
    }
}

async function processEvents(
    btcb_staking_contract: ethers.Contract,
    pell_contract: ethers.Contract,
    fromBlock: number,
    toBlock: number
) {
    console.log(`Processing events from block ${fromBlock} to ${toBlock}`);
    const stakingFilter = btcb_staking_contract.filters.StakeBTC2JoinStakePlan();
    const stakingEvents = await btcb_staking_contract.queryFilter(stakingFilter, fromBlock, toBlock);

    const pellFilter = pell_contract.filters.Deposit();
    const pellEvents = await pell_contract.queryFilter(pellFilter, fromBlock, toBlock);
  
    for (const event of stakingEvents) {
      if (event instanceof ethers.EventLog) {
        const { args } = event;
        if (args && args.length >= 6) {
            const [stakeIndex, planId, user, btcContractAddress, stakeAmount, stBTCAmount] = args;
            console.log(
                `StakeBTC2JoinStakePlan detected:
                        stakeIndex: ${stakeIndex}, 
                        planId: ${planId}, 
                        user: ${user}, 
                        btcContractAddress: ${btcContractAddress}, 
                        stakeAmount: ${stakeAmount}, 
                        stBTCAmount: ${stBTCAmount}`
            );
            if (stBTCAmount >= ethers.parseEther("0.0001")) {
                const timestamp = Math.floor(Date.now() / 1000);
                try {
                    const taskKey = `task22:${user}`;
                    const taskStatus: TaskStatus = {
                        address: user,
                        taskId: 22,
                        timestamp: timestamp,
                        uploaded: false
                    };
                    
                    try {
                        const existingTask = await db.get(taskKey);
                        if (existingTask) {
                            console.log("Task already exists, skipping...");
                            continue;
                        }
                    } catch (error: any) {
                        console.log("No existing task found, proceeding...");
                    }

                    await db.put(taskKey, taskStatus);
                    console.log(`Recorded task 22 for user ${user}`);
                    try {
                        const response = await axios.post(API_URL, {
                            token: API_TOKEN,
                            data: [
                                {
                                    taskId: 22,
                                    timestamp: timestamp,
                                    address: user
                                }
                            ]
                        }, {
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        });
                        console.log('API Response:', response.data);
                        taskStatus.uploaded = true;
                        await db.put(taskKey, taskStatus);
                        console.log(`Updated task 22 status for user ${user}`);
                    } catch (error) {
                        console.error('Error sending data to API:', error);
                    }
                } catch (error) {
                    console.error('Error processing task:', error);
                }
            }else{
                console.log('stBTCAmount is less than 0.0001');
            }
        }
      }
    }

    for (const event of pellEvents) {
        if (event instanceof ethers.EventLog) {
            const { args } = event;
            if (args && args.length >= 4) {
                const [staker, token, strategy, shares] = args;
                console.log(
                    `Pell Stake detected:
                            staker: ${staker}, 
                            token: ${token}, 
                            strategy: ${strategy}, 
                            shares: ${shares}`
                );
                if (token == STBTC_CONTRACT_ADDRESS && shares >= ethers.parseEther("0.0001")) {
                    const timestamp = Math.floor(Date.now() / 1000);
                    try {
                        const taskKey = `task23:${staker}`;
                        const taskStatus: TaskStatus = {
                            address: staker,
                            taskId: 23,
                            timestamp: timestamp,
                            uploaded: false
                        };
                        
                        try {
                            const existingTask = await db.get(taskKey);
                            if (existingTask) {
                                console.log("Task already exists, skipping...");
                                continue;
                            }
                        } catch (error: any) {
                            console.log("No existing task found, proceeding...");
                        }
                        await db.put(taskKey, taskStatus);
                        console.log(`Recorded task 23 for user ${staker}`);
                        try {
                            const response = await axios.post(API_URL, {
                                token: API_TOKEN,
                                data: [
                                    {
                                        taskId: 23,
                                        timestamp: timestamp,
                                        address: staker
                                    }
                                ]
                            }, {
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            });
                            console.log('API Response:', response.data);
                            
                            taskStatus.uploaded = true;
                            await db.put(taskKey, taskStatus);
                            console.log(`Updated task 23 status for user ${staker}`);
                        } catch (error) {
                            console.error('Error sending data to API:', error);
                        }
                    } catch (error) {
                        console.error('Error processing task:', error);
                    }
                } else {
                    console.log('stake stBTCAmount is less than 0.0002');
                }
            }
        }
    }
}

async function saveLastProcessedBlock(blockNumber: number): Promise<void> {
    await fs.promises.writeFile(BLOCK_FILE, blockNumber.toString());
}

async function getBlockHeightByTimestamp(provider: JsonRpcProvider, startBlock: number, timestamp: number) {
    let from = startBlock;
    let to = Number(await provider.getBlockNumber());

    while (from < to) {
        const mid = Math.floor((from + to) / 2);
        const block = await provider.getBlock(mid);
        if (block!.timestamp < timestamp) {
            from = mid + 1;
        } else {
            to = mid;
        }
    }
    return from;
}

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const btcb_staking_contract = new ethers.Contract(BTCB_STAKE_CONTRACT_ADDRESS, BTCB_STAKING_ABI, provider);
    const pell_contract = new ethers.Contract(PELL_CONTRACT_ADDRESS, PELL_CONTRACT_ABI, provider);
  
    let lastProcessedBlock = await getLastProcessedBlock();
    console.log(`Starting to process events from block ${lastProcessedBlock}`);
    let bStartTrack = false;
    let finished = false;
  
    while (true) {

        if (finished) {
            console.log(`Track event already finished...`);
            return;
        }

        const latestBlock = await provider.getBlockNumber();
        console.log('latestBlock:', latestBlock);
        if (!bStartTrack) {
            const block = await provider.getBlock(latestBlock);
            console.log("latestBlock.timestamp: ", block!.timestamp)
            const block1 = await provider.getBlock(lastProcessedBlock);
            console.log("lastProcessedBlock.timestamp: ", block1!.timestamp)

            if (block1!.timestamp > Number(END_TRACK_TIME)) {
                console.log("4YA_BNB_Task already finish!!!")
                return;
            }

            if (block1!.timestamp > Number(START_TRACK_TIME)) {
                bStartTrack = true
            }
            if (block1!.timestamp < Number(START_TRACK_TIME) && block!.timestamp > Number(START_TRACK_TIME)) { 
                bStartTrack = true
                let startBlock = await getBlockHeightByTimestamp(provider, lastProcessedBlock, Number(START_TRACK_TIME));
                if (startBlock > lastProcessedBlock) {
                    lastProcessedBlock = startBlock - 1;
                }
            }
            console.log('lastProcessedBlock: ', lastProcessedBlock);
        }
        if (bStartTrack) {
            try {
                if (latestBlock > lastProcessedBlock) {
                    let fromBlock = lastProcessedBlock + 1;
                    let toBlock = Math.min(latestBlock, fromBlock + 99); // Process max 100 blocks at a time

                    const block = await provider.getBlock(toBlock);
                    if (block!.timestamp > Number(END_TRACK_TIME)) {
                        let endBlock = await getBlockHeightByTimestamp(provider, fromBlock, Number(END_TRACK_TIME));
                        toBlock = endBlock
                        finished = true
                    }
                    if(fromBlock > toBlock){
                        return;
                    }
                        
                    await processEvents(btcb_staking_contract, pell_contract, fromBlock, toBlock);
                        
                    lastProcessedBlock = toBlock;
                    await saveLastProcessedBlock(lastProcessedBlock);
                    console.log(`Processed blocks ${fromBlock} to ${toBlock}`);
                }
            } catch (error) {
                console.error('Error processing events:', error);
            }
        } else {
            console.log(`Start Time not reach. ${START_TRACK_TIME}`);
        }
    
        // Wait before next polling
        console.log(`==================================`);
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    }
}
  
main().catch((error) => {
    console.error(error);
    process.exit(1);
});