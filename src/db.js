// db.js
import Dexie from 'dexie';

const db = new Dexie('GovernorDB');

db.version(1).stores({
    proposals: 'id, title, description, proposerAddress, createdAt',
    votes: '++id, proposalId, voterAddress, support, stakeAmount',
    orchestrators: 'eth_address, total_stake, reward_cut, fee_cut, activation_status, name, service_uri, avatar',
    metadata: 'key, value' // Add this line
});


// Initialize default metadata if not present
async function initializeMetadata() {
    const lastProposalBlock = await db.metadata.get('lastProposalBlock');
    const lastVoteBlock = await db.metadata.get('lastVoteBlock');

    const updates = {};

    if (!lastProposalBlock) {
        updates.key = 'lastProposalBlock';
        updates.value = 162890764; // firstTreasuryProposal
        await db.metadata.put(updates);
    }

    if (!lastVoteBlock) {
        updates.key = 'lastVoteBlock';
        updates.value = 162890764; // firstTreasuryProposal
        await db.metadata.put(updates);
    }
}

initializeMetadata();

export default db;
