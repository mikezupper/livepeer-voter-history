// DataServices.js
import { Contract, JsonRpcProvider } from "ethers";
import db from '../db.js';
import {governorABI} from "../abi.js";

const ARBITRUM_RPC_URL = "https://arb1.arbitrum.io/rpc";
if (!ARBITRUM_RPC_URL) {
    throw new Error("Please set your ARBITRUM_RPC_URL in the .env file");
}

const provider = new JsonRpcProvider(ARBITRUM_RPC_URL);
const GOVERNOR_ADDRESS = "0xcFE4E2879B786C3aa075813F0E364bb5acCb6aa0";
const governorContract = new Contract(GOVERNOR_ADDRESS, governorABI, provider);

// Initial fromBlock (you might want to store this persistently)
const firstTreasuryProposal = 162890764;

// Instead, create functions to get and set last processed blocks
const LAST_PROPOSAL_BLOCK_KEY = 'lastProposalProcessedBlock';
const LAST_VOTE_BLOCK_KEY = 'lastVoteProcessedBlock';

const ORCHESTRATOR_API_URL = "https://tools.livepeer.cloud/api/orchestrator";

/**
 * Retrieves the last processed proposal block from metadata.
 * If not present, initializes it with `firstTreasuryProposal`.
 */
async function getLastProposalProcessedBlock() {
    let block = await getMetadata(LAST_PROPOSAL_BLOCK_KEY);
    if (block === null) {
        block = firstTreasuryProposal;
        await setMetadata(LAST_PROPOSAL_BLOCK_KEY, block);
    }
    return block;
}

/**
 * Updates the last processed proposal block in metadata.
 * @param {number} block
 */
async function updateLastProposalProcessedBlock(block) {
    await setMetadata(LAST_PROPOSAL_BLOCK_KEY, block);
}

/**
 * Retrieves the last processed vote block from metadata.
 * If not present, initializes it with `firstTreasuryProposal`.
 */
async function getLastVoteProcessedBlock() {
    let block = await getMetadata(LAST_VOTE_BLOCK_KEY);
    if (block === null) {
        block = firstTreasuryProposal;
        await setMetadata(LAST_VOTE_BLOCK_KEY, block);
    }
    return block;
}

/**
 * Updates the last processed vote block in metadata.
 * @param {number} block
 */
async function updateLastVoteProcessedBlock(block) {
    await setMetadata(LAST_VOTE_BLOCK_KEY, block);
}
// Helper function to convert wei to eth
const weiToEth = (wei) => {
    return Number(wei) / 1e18;
};

// Helper function to extract and clean the first line
const getFirstLine = (text) => {
    if (!text) return '';
    let firstLine = text.split('\n')[0];
    firstLine = firstLine.replace(/^#/, '').trim();
    return firstLine;
};

// 4. Query the ProposalCreated events and store them in IndexedDB.
async function fetchAndStoreProposals() {
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = await getLastProposalProcessedBlock();
    const toBlock = latestBlock;

    const proposalCreatedFilter = governorContract.filters.ProposalCreated();

    const proposalCreatedEvents = await governorContract.queryFilter(proposalCreatedFilter, fromBlock, toBlock);

    for (const event of proposalCreatedEvents) {
        const { proposalId, proposer, description } = event.args;
        if (proposalId === undefined) {
            console.log(`proposal with undefined id`);
            continue;
        }
        const propId = proposalId.toString();

        // Check if proposal already exists
        const existing = await db.proposals.get(propId);
        if (existing) {
            console.log(`Proposal ${propId} already exists. Skipping.`);
            continue;
        }

        // Get the block and extract the timestamp
        const block = await provider.getBlock(event.blockNumber);
        const blockTimestamp = block.timestamp;

        // Lookup proposer name from orchestrators
        const orchestrator = await db.orchestrators.get(proposer.toLowerCase());
        const proposerName = orchestrator ? orchestrator.name : '';
        const proposerAvatar = orchestrator ? orchestrator.avatar : '';

        const proposal = {
            id: propId,
            title: getFirstLine(description),
            description,
            proposerAddress: proposer.toLowerCase(),
            proposerName,
            proposerAvatar,
            createdAt: blockTimestamp
        };

        await db.proposals.add(proposal);
        console.log(`Stored proposal ${propId}`);
    }

    // Update the last processed block in metadata
    await updateLastProposalProcessedBlock(toBlock + 1);
}

// 5. Query the CastVote events and store them in IndexedDB.
async function fetchAndStoreVotes() {
    console.log(`Fetching vote for proposals`);

    const latestBlock = await provider.getBlockNumber();
    const fromBlock = await getLastVoteProcessedBlock();
    const toBlock = latestBlock;

    const castVoteFilter = governorContract.filters.VoteCast();

    const castVoteEvents = await governorContract.queryFilter(castVoteFilter, fromBlock, toBlock);

    for (const event of castVoteEvents) {
        const { voter, proposalId, support, weight } = event.args;

        const pid = proposalId.toString();

        // Optionally, verify that the proposal exists
        const proposalExists = await db.proposals.get(pid);
        if (!proposalExists) {
            console.log(`Proposal ${pid} not found. Skipping vote.`);
            continue;
        }

        const nSupport = Number(support);
        let supportMsg = "No";
        switch (nSupport) {
            case 1:
                supportMsg = "Yes";
                break;
            case 2:
                supportMsg = "Abstain";
                break;
            default:
                supportMsg = "No";
                break;
        }
        const orchestrator = await db.orchestrators.get(voter.toLowerCase());
        const voterName = orchestrator ? orchestrator.name : '';
        const voterAvatar = orchestrator ? orchestrator.avatar : '';
        const vote = {
            proposalId: pid,
            voterAddress: voter.toLowerCase(),
            voterName,
            voterAvatar,
            support: supportMsg,
            stakeAmount: weiToEth(weight)
        };

        await db.votes.add(vote);
        console.log(`Stored vote for proposal ${pid} by ${voter}`);
    }
    // Update the last processed block in metadata
    await updateLastVoteProcessedBlock(toBlock + 1);
}


// 7. Fetch and store Orchestrator data
async function fetchAndStoreOrchestrators() {
    console.log(`Fetching orchestrator data from ${ORCHESTRATOR_API_URL}`);

    try {
        const response = await fetch(ORCHESTRATOR_API_URL);
        const orchestrators = await response.json();

        if (!Array.isArray(orchestrators)) {
            console.error("Orchestrator data is not an array.");
            return;
        }

        for (const orch of orchestrators) {
            const {
                eth_address,
                total_stake,
                reward_cut,
                fee_cut,
                activation_status,
                name,
                service_uri,
                avatar
            } = orch;

            if (!eth_address) {
                console.log("Orchestrator with missing eth_address. Skipping.");
                continue;
            }

            const orchestrator = {
                eth_address: eth_address.toLowerCase(), // Normalize address
                total_stake: Number(total_stake),
                reward_cut: Number(reward_cut),
                fee_cut: Number(fee_cut),
                activation_status: Boolean(activation_status),
                name: name || '',
                service_uri: service_uri || '',
                avatar: avatar || ''
            };

            // Upsert orchestrator data
            await db.orchestrators.put(orchestrator);
            console.log(`Stored/Updated orchestrator ${orchestrator.eth_address}`);
        }

        console.log("Orchestrator data fetch and store completed.");
    } catch (error) {
        console.error("Error fetching orchestrator data:", error);
    }
}
// Periodic update function to fetch new proposals and votes
async function periodicUpdate() {
    try {
        console.log("Starting periodic update...");
        await fetchAndStoreOrchestrators();
        await fetchAndStoreProposals();
        await fetchAndStoreVotes();
        console.log("Periodic update completed.");
    } catch (error) {
        console.error("Error during periodic update:", error);
    }
}

// Helper function to initialize the database with existing data
async function initializeData() {
    await periodicUpdate();
}

// 6. Query the data from Dexie
export default class DataServices {
    // Initialize the data on first load
    static async init() {
        await initializeData();

        // Set up periodic updates every 5 minutes (300,000 ms)
        setInterval(periodicUpdate, 300000);
    }

    // Get all proposals
    static async getProposals() {
        const proposals = await db.proposals.toArray();
        console.log(`Retrieved ${proposals.length} proposals from IndexedDB`);

        // For each proposal, get associated votes
        for (const proposal of proposals) {
            const votes = await db.votes
                .where('proposalId')
                .equals(proposal.id)
                .toArray();

            // Sort votes by stakeAmount descending
            votes.sort((a, b) => b.stakeAmount - a.stakeAmount);

            proposal.votes = votes;
        }
        proposals.sort((a, b) => b.createdAt - a.createdAt);

        return proposals;
    }
}



/**
 * Retrieves a metadata value by key.
 * @param {string} key
 * @param {any} defaultValue - Value to return if key does not exist.
 * @returns {Promise<any>}
 */
async function getMetadata(key, defaultValue = null) {
    const entry = await db.metadata.get(key);
    return entry ? entry.value : defaultValue;
}

/**
 * Sets a metadata value by key.
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
async function setMetadata(key, value) {
    await db.metadata.put({ key, value });
}
