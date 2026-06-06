const mineflayer         = require('mineflayer');
const ping               = require('minecraft-protocol').ping; 
const readline           = require('readline');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalFollow, GoalBlock, GoalXZ, GoalLookAtBlock } = goals;
const pvp                = require('mineflayer-pvp').plugin;
const armorManager       = require('mineflayer-armor-manager');
const { Vec3 }           = require('vec3');

// ── CONFIG ──────────────────────────────────────────────────────────────────
const PASSWORD = '313131';

const settings = {
    username : 'Itz_Alisia',
    host     : 'hofghnnn.aternos.me',
    port     : 52677, 
    version  : '1.21.1',
    logErrors: false
};

const TRASH_ITEMS = [
    'cobblestone', 'dirt', 'netherrack', 'andesite', 'diorite', 'granite', 
    'gravel', 'sand', 'rotten_flesh', 'poisonous_potato', 'spider_eye',
    'scaffolding', 'oak_leaves', 'spruce_leaves', 'birch_leaves', 'jungle_leaves'
];

// ── COMBAT & REACH CONSTANTS ───────────────────────────────────────────────
const VIEW_RANGE   = 24; 
const FOLLOW_RANGE = 0.6; 
const ATTACK_RANGE = 3.8;

// ── CRYSTAL PVP CONSTANTS ──────────────────────────────────────────────────
const CRYSTAL_PLACE_RANGE  = 4.5;
const CRYSTAL_BREAK_RANGE  = 5.0;
const CRYSTAL_MIN_DAMAGE   = 6;     
const CRYSTAL_SELF_DAMAGE_LIMIT = 4; 
const CRYSTAL_LOOP_MS      = 120;   

// ── SWORD PVP CONSTANTS ────────────────────────────────────────────────────
const SWORD_ENGAGE_RANGE   = 6.0;   
const SWORD_COMBO_RANGE    = 4.2;   
const SWORD_STAP_DIST      = 5.5;   
const SWORD_CRIT_JUMP_MS   = 55;    
const SWORD_CRIT_SWING_MS  = 220;   
const SWORD_WTAP_DELAY_MS  = 35;    
const SWORD_STAP_DELAY_MS  = 80;    

// ── SURVIVAL / HEALING CONSTANTS ──────────────────────────────────────────
const FLEE_HEALTH_THRESHOLD  = 8;   
const EAT_HEALTH_THRESHOLD   = 14;  
const TOTEM_SLOT             = 'off-hand'; 

const mcData = require('minecraft-data')(settings.version);

// ── STATE ENGINE ────────────────────────────────────────────────────────────
let fighting   = false;
let target     = null;
let guardMode  = false;
let guardPos   = null;
let miningMode = false;
let buildMode  = false;

let crystalMode    = false;  
let crystalLoopRef = null;  
let lastCrystalPlaceTime = 0;
let lastCrystalBreakTime = 0;

let swordComboActive    = false; 
let lastStapTime        = 0;      
let sTapPhase           = false; 
let inFleeMode          = false;  
let isEating            = false;  

let strafeDirection = 'left';
let lastStrafeSwap  = Date.now();
let lastAttackTime  = 0; 
let idleTimeout     = null;

let lastPosition = null;
let stuckTicks = 0;
const STUCK_THRESHOLD = 6; 
let stuckAttemptsCounter = 0;
const MAX_STUCK_ATTEMPTS  = 5;

let bot = null;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.on('line', (line) => { 
    if (line.trim().length > 0 && bot && bot.chat) bot.chat(line);
});

// ============================================================================
//  CORE INITIALIZATION & RECONNECT WRAPPER
// ============================================================================
function initBot() {
    ping({ host: settings.host, port: 25565, version: settings.version }, (err, results) => {
        if (results && results.port) {
            settings.port = results.port; 
        }

        bot = mineflayer.createBot(settings);

        bot.loadPlugin(pathfinder);
        bot.loadPlugin(pvp);
        bot.loadPlugin(armorManager);

        linkEventRoutines();

        bot.once('spawn', () => {
            bot.chat(`/login ${PASSWORD}`);
            setTimeout(() => bot.chat(`/register ${PASSWORD} ${PASSWORD}`), 1500);
            setTimeout(() => bot.chat(`/l ${PASSWORD}`), 3000);

            triggerArmorEvaluation();

            const movements = new Movements(bot, mcData);
            movements.scafoldingBlocks = []; 
            movements.canDig = true;         
            movements.allow1by1tunnels = false; 
            movements.allowSprinting = true; 
            movements.canJump = true;        
            movements.allowParkour = true;   
            movements.liquidCost = 6; 

            if (mcData.blocksByName['lava']) movements.blocksToAvoid.add(mcData.blocksByName['lava'].id);
            if (mcData.blocksByName['sweet_berry_bush']) movements.blocksToAvoid.add(mcData.blocksByName['sweet_berry_bush'].id);
            if (mcData.blocksByName['cactus']) movements.blocksToAvoid.add(mcData.blocksByName['cactus'].id);

            const leafBlocks = ['oak_leaves', 'spruce_leaves', 'birch_leaves', 'jungle_leaves', 'acacia_leaves', 'dark_oak_leaves', 'mangrove_leaves', 'cherry_leaves', 'azalea_leaves'];
            leafBlocks.forEach(leafName => {
                if (mcData.blocksByName[leafName]) movements.blocksToAvoid.add(mcData.blocksByName[leafName].id);
            });

            bot.pathfinder.setMovements(movements);
            startIdleWanderLoop();
        });

        bot.on('end', () => {
            stopAllTasks();
            clearTimeout(idleTimeout);
            setTimeout(initBot, 5000);
        });
    });
}

// ============================================================================
//  DYNAMIC EVENT MAPPING SYSTEM
// ============================================================================
function linkEventRoutines() {
    bot.on('message', (jsonMsg) => {
        const msg   = jsonMsg.toString();
        const lower = msg.toLowerCase();

        if ((lower.includes('tpa') || lower.includes('teleport')) && (lower.includes('request') || lower.includes('ask')) && !lower.includes('accepted')) {
            setTimeout(() => bot.chat('/tpaccept'), 250);
        }
        if (lower.includes('/register')) bot.chat(`/register ${PASSWORD} ${PASSWORD}`);
        else if (lower.includes('/login')) bot.chat(`/login ${PASSWORD}`);
    });

    bot.on('physicsTick', () => {
        if (!bot.entity) return;

        if (bot.pathfinder.isMoving() && bot.entity.onGround) {
            const currentVelocity = bot.entity.velocity;
            const speed = Math.sqrt(currentVelocity.x * currentVelocity.x + currentVelocity.z * currentVelocity.z);
            if (speed > 0.05) {
                const dirX = currentVelocity.x / speed;
                const dirZ = currentVelocity.z / speed;
                const lookAheadFoot = bot.entity.position.offset(dirX * 0.85, 0, dirZ * 0.85);
                const lookAheadKnee = bot.entity.position.offset(dirX * 0.85, 1, dirZ * 0.85);
                const footBlock = bot.blockAt(lookAheadFoot);
                const kneeBlock = bot.blockAt(lookAheadKnee);

                if ((footBlock && footBlock.boundingBox !== 'empty' && !footBlock.name.includes('air')) ||
                    (kneeBlock && kneeBlock.boundingBox !== 'empty' && !kneeBlock.name.includes('air'))) {
                    bot.setControlState('jump', true);
                    setTimeout(() => { bot.setControlState('jump', false); }, 60);
                }
            }
        }

        if (bot.pathfinder.isMoving()) {
            if (lastPosition) {
                if (bot.entity.position.distanceTo(lastPosition) < 0.03) {
                    stuckTicks++;
                    if (stuckTicks >= STUCK_THRESHOLD) handleStuckScenario();
                } else {
                    stuckTicks = 0;
                    stuckAttemptsCounter = 0; 
                }
            }
            lastPosition = bot.entity.position.clone();
        } else {
            stuckTicks = 0;
            lastPosition = null;
        }

        if (fighting && target) {
            if (!target.isValid) { stopFighting(); return; }
            const dist = bot.entity.position.distanceTo(target.position);

            if (bot.health <= FLEE_HEALTH_THRESHOLD && !inFleeMode) {
                inFleeMode = true;
                clearMovementControls();
                bot.setControlState('sprint', true);
                const dx = bot.entity.position.x - target.position.x;
                const dz = bot.entity.position.z - target.position.z;
                const len = Math.sqrt(dx * dx + dz * dz) || 1;
                bot.pathfinder.setGoal(new GoalXZ(bot.entity.position.x + (dx / len) * 18, bot.entity.position.z + (dz / len) * 18), true);
                setTimeout(() => eatBestFood(), 200);
                return;
            }

            if (inFleeMode) {
                if (bot.health > FLEE_HEALTH_THRESHOLD + 4 && !isEating) {
                    inFleeMode = false;
                    bot.setControlState('sprint', false);
                    if (target && target.isValid) {
                        bot.pathfinder.setGoal(new GoalFollow(target, FOLLOW_RANGE), true);
                        executeAttackSequence();
                    }
                } else if (!isEating) {
                    eatBestFood();
                }
                return;
            }

            if (crystalMode) {
                bot.lookAt(target.position.offset(0, target.height * 0.5, 0), true);
                return;
            }

            const targetVel = target.velocity || { x: 0, y: 0, z: 0 };
            const eyeHeight = target.type === 'player' ? target.height : target.height * 0.85;
            const predictedPos = target.position.offset(
                (targetVel.x * 1.25) + ((Math.random() - 0.5) * 0.03),
                eyeHeight + (targetVel.y * 1.25),
                (targetVel.z * 1.25) + ((Math.random() - 0.5) * 0.03)
            );
            
            bot.lookAt(predictedPos, true);

            if (bot.entity.isCollidedHorizontally && bot.entity.onGround) bot.setControlState('jump', true);
            else if (!fighting) bot.setControlState('jump', false);

            if (dist <= SWORD_COMBO_RANGE) {
                bot.setControlState('sprint', true);
                if (!sTapPhase) {
                    if (Date.now() - lastStrafeSwap > 130 + Math.random() * 100) {
                        strafeDirection = strafeDirection === 'left' ? 'right' : 'left';
                        if (Math.random() < 0.18) strafeDirection = 'forward'; 
                        lastStrafeSwap = Date.now();
                    }
                    bot.setControlState('left',    strafeDirection === 'left');
                    bot.setControlState('right',   strafeDirection === 'right');
                    bot.setControlState('forward', strafeDirection === 'forward' || dist > ATTACK_RANGE - 0.3);
                }
                if (dist > ATTACK_RANGE) {
                    const shield = bot.inventory.items().find(i => i.name.includes('shield'));
                    if (shield) bot.equip(shield, 'off-hand').catch(() => {});
                }
            } else if (dist <= SWORD_ENGAGE_RANGE) {
                clearMovementControls();
                bot.setControlState('sprint', true);
                bot.setControlState('forward', true);
                bot.pathfinder.setGoal(new GoalFollow(target, FOLLOW_RANGE), true);
            } else {
                clearMovementControls();
                bot.setControlState('forward', true);
                if (bot.pathfinder.isMainThreadBlocked === false) bot.pathfinder.setGoal(new GoalFollow(target, FOLLOW_RANGE), true);
            }
        } else if (guardMode) {
            const mob = bot.nearestEntity((e) => 
                (e.type === 'mob' || e.type === 'player') && bot.entity && 
                e.position.distanceTo(bot.entity.position) < 16 && 
                e.displayName !== 'Armor Stand' && e.username !== settings.username
            );
            if (mob) startFighting(mob); 
            else if (!bot.pathfinder.isMoving() && guardPos && bot.entity.position.distanceTo(guardPos) > 1) moveToGuardPos();
        } else {
            const playerEntity = bot.nearestEntity((e) => e.type === 'player' && e.username !== settings.username);
            if (playerEntity && !miningMode && !buildMode) bot.lookAt(playerEntity.position.offset(0, playerEntity.height, 0));
        }
    });

    bot.on('entityHurt', (entity) => {
        if (!bot.entity || entity.id !== bot.entity.id) return;
        triggerArmorEvaluation();
        ensureTotemEquipped();
        if (bot.health <= FLEE_HEALTH_THRESHOLD + 2 && !isEating) eatBestFood();
        
        const threat = bot.nearestEntity((e) => (e.type === 'player' || e.type === 'mob') && e.username !== settings.username && e.displayName !== 'Armor Stand');
        if (threat && bot.entity.position.distanceTo(threat.position) <= VIEW_RANGE) {
            if (target && target.id === threat.id) return; 
            bot.chat("[Target: Lock]");
            startFighting(threat);
        }
    });

    bot.on('playerCollect', (collector) => {
        if (collector !== bot.entity) return;
        setTimeout(triggerArmorEvaluation, 80);
        setTimeout(ensureTotemEquipped, 100);
        setTimeout(() => { if (bot.food < 18 && !isEating && !fighting) eatBestFood(); }, 200);
    });

    bot.on('entityGone', (entity) => { if (entity === target) stopFighting(); });
    bot.on('death', () => {
        stopAllTasks();
        setTimeout(() => { try { bot.respawn(); } catch (err) {} }, 1000);
    });

    bot.on('messagestr', (message, position, jsonMsg, sender) => {
        if (position !== 'chat') return;
        if (sender && (sender.toLowerCase() === 'itz_alisia' || sender.toLowerCase() === settings.username.toLowerCase())) return;

        let clean = message.replace(/[\u00A0\u200B]/g, ' ').replace(/§[0-9a-fk-orx]/gi, '').trim();
        const lowerMsg = clean.toLowerCase();
        if (lowerMsg.includes('commands:') || lowerMsg.includes('bot commands') || lowerMsg.includes('status:')) return;

        const tokens = clean.split(/\s+/);
        if (tokens.length === 0) return;

        const commandsList = ['tpa', 'tpaccept', 'tpyes', 'go', 'stop', 'status', 'guard', 'fight', 'follow', 'help', 'come', 'say', 'jump', 'clear', 'back', 'mine', 'dropall', 'build', 'unload', 'load', 'crystal', 'sword', 'pvp'];
        let cmdIdx = -1;
        let cmd = '';

        for (let i = 0; i < tokens.length; i++) {
            const word = tokens[i].toLowerCase().replace(/[^a-z]/g, '');
            if (commandsList.includes(word)) { cmdIdx = i; cmd = word; break; }
        }
        if (cmdIdx === -1) return;
        if (tokens.slice(0, cmdIdx).join(' ').toLowerCase().includes(settings.username.toLowerCase())) return;

        let senderName = '';
        for (let j = cmdIdx - 1; j >= 0; j--) {
            let candidate = tokens[j].replace(/[:>»\xBB\[\]()]/g, '').trim();
            if (/^[a-zA-Z0-9_]{2,16}$/.test(candidate)) { senderName = candidate; break; }
        }
        if (!senderName) senderName = tokens[0].replace(/[:>»\xBB\[\]()]/g, '').trim();
        if (senderName.toLowerCase() === settings.username.toLowerCase()) return;

        executeCommand(senderName, cmd, tokens, cmdIdx);
    });
}

function clearMovementControls() {
    bot.setControlState('left', false);
    bot.setControlState('right', false);
    bot.setControlState('back', false);
    bot.setControlState('forward', false);
}

// ============================================================================
//  MULTI-STAGE EXTRACTION MECHANICS
// ============================================================================
async function handleStuckScenario() {
    stuckAttemptsCounter++;
    stuckTicks = 0;
    const goal = bot.pathfinder.goal;
    bot.pathfinder.setGoal(null);
    clearMovementControls();

    if (stuckAttemptsCounter <= 2) {
        bot.setControlState('jump', true);
        const dirs = ['left', 'right', 'back'];
        const rDir = dirs[Math.floor(Math.random() * dirs.length)];
        bot.setControlState(rDir, true);
        setTimeout(() => {
            bot.setControlState('jump', false);
            bot.setControlState(rDir, false);
            if (goal) bot.pathfinder.setGoal(goal);
        }, 300);
        return;
    }

    if (stuckAttemptsCounter === 3) {
        await bot.look(bot.entity.yaw + Math.PI, bot.entity.pitch, true);
        bot.setControlState('back', true);
        bot.setControlState('jump', true);
        setTimeout(() => {
            bot.setControlState('back', false);
            bot.setControlState('jump', false);
            if (goal) bot.pathfinder.setGoal(goal);
        }, 400);
        return;
    }

    if (stuckAttemptsCounter === 4) {
        const vel = bot.entity.velocity;
        const spd = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
        let dx = spd > 0.01 ? vel.x / spd : Math.cos(bot.entity.yaw);
        let dz = spd > 0.01 ? vel.z / spd : Math.sin(bot.entity.yaw);

        const hBlock = bot.blockAt(bot.entity.position.offset(dx * 0.7, 1, dz * 0.7));
        const lBlock  = bot.blockAt(bot.entity.position.offset(dx * 0.7, 0, dz * 0.7));

        const mine = async (b) => {
            if (b && b.boundingBox !== 'empty' && bot.canDigBlock(b)) {
                const p = bot.inventory.items().find(i => i.name.includes('pickaxe'));
                if (p) await bot.equip(p, 'hand');
                try { await bot.dig(b); } catch (e) {}
            }
        };
        if (hBlock) await mine(hBlock);
        if (lBlock) await mine(lBlock);

        bot.setControlState('forward', true);
        bot.setControlState('jump', true);
        setTimeout(() => {
            bot.setControlState('forward', false);
            bot.setControlState('jump', false);
            if (goal) bot.pathfinder.setGoal(goal);
        }, 300);
        return;
    }

    if (stuckAttemptsCounter >= MAX_STUCK_ATTEMPTS) {
        stuckAttemptsCounter = 0;
        stopAllTasks();
        bot.chat("/back"); 
        setTimeout(() => { startIdleWanderLoop(); }, 1000);
    }
}

setInterval(() => {
    if (!bot || !bot.entity || fighting) return;
    const mob = bot.nearestEntity((e) => e.type === 'mob' && (e.displayName === 'Zombie' || e.displayName === 'Skeleton' || e.displayName === 'Creeper'));
    if (!mob) return;
    bot.lookAt(mob.position, true, () => bot.attack(mob));
}, 1000);

// ============================================================================
//  PVP WEAPON COOLDOWN UTILITIES
// ============================================================================
function getWeaponCooldown(name) {
    if (!name) return 4.0;
    if (name.includes('sword'))   return 1.6;
    if (name.includes('trident')) return 1.1;
    if (name.includes('pickaxe')) return 1.2;
    if (name.includes('shovel'))  return 1.0;
    if (name.includes('hoe')) return (name.includes('iron') ? 2.0 : name.includes('diamond') || name.includes('netherrite') ? 4.0 : 1.0);
    if (name.includes('axe')) return (name.includes('wooden') || name.includes('stone') ? 0.8 : 1.0);
    return 4.0;
}

function selectBestMeleeWeapon(blocking) {
    const inv = bot.inventory.items();
    if (blocking) { const axe = inv.find(i => i.name.includes('axe')); if (axe) return axe; }
    const priorities = [i => i.name === 'netherite_sword', i => i.name === 'diamond_sword', i => i.name === 'iron_sword', i => i.name.includes('sword'), i => i.name.includes('axe')];
    for (const check of priorities) { const found = inv.find(check); if (found) return found; }
    return null;
}

function selectBestFood() {
    const inv = bot.inventory.items();
    const priorities = [i => i.name === 'enchanted_golden_apple', i => i.name === 'golden_apple', i => i.name === 'golden_carrot', i => i.name === 'cooked_porkchop', i => i.name === 'cooked_beef', i => i.name === 'cooked_chicken', i => i.name === 'bread', i => i.name.includes('cooked'), i => i.name.includes('food') || i.name.includes('apple') || i.name.includes('carrot') || i.name.includes('melon') || i.name.includes('beef') || i.name.includes('pork') || i.name.includes('chicken') || i.name.includes('mutton') || i.name.includes('rabbit')];
    for (const check of priorities) { const found = inv.find(check); if (found) return found; }
    return null;
}

async function eatBestFood() {
    if (isEating) return;
    const food = selectBestFood();
    if (!food) return;
    isEating = true;
    try {
        await bot.equip(food, 'hand');
        await bot.consume();
    } catch (err) {}
    isEating = false;
    if (bot.health < EAT_HEALTH_THRESHOLD && !fighting) {
        const next = selectBestFood();
        if (next) setTimeout(eatBestFood, 300);
    }
}

function ensureTotemEquipped() {
    if (!bot || !bot.inventory) return;
    const offHand = bot.inventory.slots[45]; 
    if (offHand && offHand.name === 'totem_of_undying') return; 
    const totem = bot.inventory.items().find(i => i.name === 'totem_of_undying');
    if (totem) bot.equip(totem, 'off-hand').catch(() => {});
}

function enhancedArmorPickup() {
    if (bot && bot.armorManager && typeof bot.armorManager.equipAll === 'function') bot.armorManager.equipAll();
    ensureTotemEquipped();
}

// ============================================================================
//  SWORD PVP ATTACK CORE
// ============================================================================
function executeAttackSequence() {
    if (!fighting || !target || crystalMode || inFleeMode || isEating) return;
    const distance = bot.entity.position.distanceTo(target.position);

    if (distance <= ATTACK_RANGE) {
        const blocking = target.metadata && (target.metadata[8] === 3 || target.metadata[7] === 3);
        const weapon = selectBestMeleeWeapon(blocking);
        let wName = weapon ? weapon.name : 'hand';

        if (weapon) bot.equip(weapon, 'hand').catch(() => {});
        const interval = Math.round(1000 / getWeaponCooldown(wName));

        const swing = () => {
            if (!fighting || !target || crystalMode || inFleeMode) return;
            if (Date.now() - lastAttackTime < interval - 30) { setTimeout(executeAttackSequence, 8); return; }

            bot.lookAt(target.position.offset(0, target.height * 0.85, 0), true);
            bot.setControlState('sprint', false);
            bot.attack(target, true);
            lastAttackTime = Date.now();

            setTimeout(() => { if (fighting && !inFleeMode) bot.setControlState('sprint', true); }, SWORD_WTAP_DELAY_MS);

            if (bot.entity.position.distanceTo(target.position) < SWORD_COMBO_RANGE - 0.5 && !sTapPhase && Date.now() - lastStapTime > 600) {
                sTapPhase = true;
                lastStapTime = Date.now();
                bot.setControlState('forward', false);
                bot.setControlState('back', true);
                bot.setControlState('sprint', false);
                setTimeout(() => {
                    sTapPhase = false;
                    bot.setControlState('back', false);
                    if (fighting && !inFleeMode) { bot.setControlState('sprint', true); bot.setControlState('forward', true); }
                }, SWORD_STAP_DELAY_MS);
            }
            setTimeout(executeAttackSequence, interval + Math.floor(Math.random() * 12));
        };

        if (!bot.entity.onGround && bot.entity.velocity.y < -0.08) {
            swing();
        } else if (bot.entity.onGround) {
            bot.setControlState('jump', true);
            setTimeout(() => { bot.setControlState('jump', false); setTimeout(swing, SWORD_CRIT_SWING_MS); }, SWORD_CRIT_JUMP_MS);
        } else {
            setTimeout(executeAttackSequence, 8);
        }
    } else if (distance <= SWORD_ENGAGE_RANGE) {
        if (distance <= ATTACK_RANGE + 0.5) {
            const w = selectBestMeleeWeapon(false);
            if (w) bot.equip(w, 'hand').catch(() => {});
            bot.lookAt(target.position.offset(0, target.height * 0.85, 0), true);
            bot.attack(target, true);
            lastAttackTime = Date.now();
        }
        bot.pathfinder.setGoal(new GoalFollow(target, FOLLOW_RANGE), true);
        setTimeout(executeAttackSequence, 40);
    } else {
        bot.pathfinder.setGoal(new GoalFollow(target, FOLLOW_RANGE), true);
        setTimeout(executeAttackSequence, 35);
    }
}

// ============================================================================
//  CRYSTAL PVP MODULE
// ============================================================================
function estimateCrystalDamage(exPos, vicPos) {
    const d = exPos.distanceTo(vicPos);
    if (d > 12) return 0;
    return (1 - d / 12) * 12 * 0.4;
}

function findCrystalPlaceSpot() {
    if (!target) return null;
    const tp = target.position;
    const candidates = [];

    for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
            const base = tp.offset(dx, -1, dz);
            const b = bot.blockAt(base);
            if (!b || (b.name !== 'obsidian' && b.name !== 'bedrock')) continue;
            const above = bot.blockAt(base.offset(0, 1, 0));
            if (!above || above.name !== 'air') continue;

            const placePos = base.offset(0, 1, 0);
            if (bot.entity.position.distanceTo(placePos) > CRYSTAL_PLACE_RANGE) continue;

            const dmg = estimateCrystalDamage(placePos, tp);
            const selfDmg = estimateCrystalDamage(placePos, bot.entity.position);
            if (dmg < CRYSTAL_MIN_DAMAGE || selfDmg > CRYSTAL_SELF_DAMAGE_LIMIT) continue;

            candidates.push({ pos: base, placePos, dmg, selfDmg });
        }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.dmg - a.dmg);
    return candidates[0];
}

async function crystalLoop() {
    if (!fighting || !target || !crystalMode) return;
    try {
        const liveCrystals = Object.values(bot.entities).filter(e => e.name === 'end_crystal' && bot.entity.position.distanceTo(e.position) <= CRYSTAL_BREAK_RANGE);
        const now = Date.now();

        for (const crystal of liveCrystals) {
            if (target.position.distanceTo(crystal.position) <= 6 && now - lastCrystalBreakTime > 50) {
                bot.lookAt(crystal.position, true);
                bot.attack(crystal);
                lastCrystalBreakTime = Date.now();
                await bot.waitForTicks(1);
            }
        }

        if (now - lastCrystalPlaceTime > CRYSTAL_LOOP_MS) {
            const item = bot.inventory.items().find(i => i.name === 'end_crystal');
            if (!item) { stopCrystalMode(); return; }

            const spot = findCrystalPlaceSpot();
            if (spot) {
                await bot.equip(item, 'hand');
                const ref = bot.blockAt(spot.pos);
                if (ref) {
                    bot.lookAt(spot.pos.offset(0.5, 1, 0.5), true);
                    await bot.placeBlock(ref, new Vec3(0, 1, 0));
                    lastCrystalPlaceTime = Date.now();
                }
            }
        }

        const dist = bot.entity.position.distanceTo(target.position);
        if (dist > CRYSTAL_BREAK_RANGE - 0.5) {
            bot.pathfinder.setGoal(new GoalFollow(target, CRYSTAL_PLACE_RANGE - 1), true);
        } else if (dist < 2.5) {
            const dx = bot.entity.position.x - target.position.x;
            const dz = bot.entity.position.z - target.position.z;
            const len = Math.sqrt(dx*dx + dz*dz) || 1;
            bot.pathfinder.setGoal(new GoalXZ(bot.entity.position.x + (dx/len)*3, bot.entity.position.z + (dz/len)*3), true);
        }
    } catch (err) {}
}

function startCrystalMode() {
    if (crystalLoopRef) clearInterval(crystalLoopRef);
    crystalMode = true;
    crystalLoopRef = setInterval(crystalLoop, CRYSTAL_LOOP_MS);
}

function stopCrystalMode() {
    crystalMode = false;
    if (crystalLoopRef) { clearInterval(crystalLoopRef); crystalLoopRef = null; }
}

// ============================================================================
//  UNIVERSAL FIGHT RUNTIME CONTROL
// ============================================================================
function startFighting(entity) {
    if (fighting && target === entity) return;
    fighting    = true;
    target      = entity;
    inFleeMode  = false;
    sTapPhase   = false;
    bot.pathfinder.setGoal(new GoalFollow(target, FOLLOW_RANGE), true);

    enhancedArmorPickup();
    if (!crystalMode) executeAttackSequence();
}

function startIdleWanderLoop() {
    if (idleTimeout) clearTimeout(idleTimeout);
    const wander = () => {
        if (!fighting && !guardMode && !miningMode && !buildMode && bot && bot.entity && !bot.pathfinder.isMoving()) {
            const dest = bot.entity.position.offset((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16);
            bot.pathfinder.setGoal(new GoalXZ(dest.x, dest.z));
        }
        idleTimeout = setTimeout(wander, 8000 + Math.random() * 7000);
    };
    wander();
}

function stopFighting() {
    fighting    = false;
    target      = null;
    inFleeMode  = false;
    sTapPhase   = false;
    stopCrystalMode();
    clearMovementControls();
    bot.setControlState('forward', false);
    bot.setControlState('jump', false);
    if (bot && bot.pathfinder) bot.pathfinder.setGoal(null);
    if (!miningMode && !buildMode) startIdleWanderLoop();
}

function stopGuarding() {
    guardPos  = null;
    guardMode = false;
    if (bot && bot.pathfinder) bot.pathfinder.setGoal(null);
    if (!miningMode && !buildMode) startIdleWanderLoop();
}

function stopAllTasks() {
    miningMode = false;
    buildMode = false;
    stopFighting();
    stopGuarding();
    if (bot && bot.pathfinder) bot.pathfinder.setGoal(null);
}

function triggerArmorEvaluation() {
    if (!buildMode && !miningMode) enhancedArmorPickup();
}

function followPlayer(username) {
    const p = bot.players[username];
    if (!p || !p.entity) return;
    bot.pathfinder.setGoal(new GoalFollow(p.entity, 1), true);
}

// ============================================================================
//  STORAGE INTERACTION CORE
// ============================================================================
async function putArmorInNearbyChest() {
    stopAllTasks();
    buildMode = true; 

    const cBlock = bot.findBlock({ matching: [mcData.blocksByName['chest'].id, mcData.blocksByName['trapped_chest'].id], maxDistance: 6 });
    if (!cBlock) { buildMode = false; return; }

    const types = ['helmet', 'chestplate', 'leggings', 'boots'];
    for (const t of types) {
        if (bot.inventory.equipped && bot.inventory.equipped[t]) {
            try { await bot.unequip(t); await bot.waitForTicks(3); } catch (e) {}
        }
    }

    try {
        await bot.pathfinder.goto(new GoalLookAtBlock(cBlock.position, bot.world));
        const win = await bot.openChest(cBlock);
        await bot.waitForTicks(5);

        const items = bot.inventory.items().filter(item => ['helmet', 'chestplate', 'leggings', 'boots'].some(k => item.name.toLowerCase().includes(k)));
        if (items.length === 0) { win.close(); buildMode = false; return; }

        for (const i of items) { try { await win.deposit(i.type, null, i.count); await bot.waitForTicks(5); } catch (de) {} }
        win.close();
    } catch (err) {}
    
    buildMode = false;
    startIdleWanderLoop();
}

async function loadFromNearbyChest() {
    if (buildMode) return;
    buildMode = true;

    const cBlock = bot.findBlock({ matching: [mcData.blocksByName['chest'].id, mcData.blocksByName['trapped_chest'].id], maxDistance: 6 });
    if (!cBlock) { buildMode = false; return; }

    try {
        await bot.pathfinder.goto(new GoalLookAtBlock(cBlock.position, bot.world));
        const chest = await bot.openChest(cBlock);
        await bot.waitForTicks(5);

        const items = chest.containerItems();
        if (items.length === 0) { chest.close(); buildMode = false; return; }

        for (const item of items) {
            if (bot.inventory.firstEmptyInventorySlot() === null) break;
            try { await chest.withdraw(item.type, null, item.count); await bot.waitForTicks(3); } catch (err) {}
        }
        chest.close();
    } catch (err) {}

    buildMode = false;
    triggerArmorEvaluation();
}

async function unloadToNearbyChest() {
    if (buildMode) return;
    buildMode = true;

    const cBlock = bot.findBlock({ matching: [mcData.blocksByName['chest'].id, mcData.blocksByName['trapped_chest'].id], maxDistance: 6 });
    if (!cBlock) { buildMode = false; return; }

    const keep = ['sword', 'pickaxe', 'axe', 'shovel', 'hoe', 'helmet', 'chestplate', 'leggings', 'boots', 'shield', 'bow', 'crossbow', 'trident', 'totem'];

    try {
        await bot.pathfinder.goto(new GoalLookAtBlock(cBlock.position, bot.world));
        const chest = await bot.openChest(cBlock);
        await bot.waitForTicks(5);

        const items = bot.inventory.items().filter(item => !keep.some(kw => item.name.includes(kw)));
        if (items.length === 0) { chest.close(); buildMode = false; return; }

        for (const item of items) { try { await chest.deposit(item.type, null, item.count); await bot.waitForTicks(3); } catch (err) {} }
        chest.close();
    } catch (err) {}

    buildMode = false;
    triggerArmorEvaluation();
}

async function dropTargetedItem(username, itemName) {
    const p = bot.players[username];
    if (!p || !p.entity) return;

    const item = bot.inventory.items().find(i => i.name.toLowerCase().includes(itemName.toLowerCase()));
    if (!item) return;

    try { await bot.tossStack(item); } catch (err) {}
}

function guardArea(pos) {
    guardPos  = pos.clone();
    guardMode = true;
    if (!bot.pvp.target) moveToGuardPos();
}

function comeToCoordinates(username) {
    const p = bot.players[username];
    if (!p || !p.entity) return;
    bot.pathfinder.setGoal(new GoalBlock(p.entity.position.x, p.entity.position.y, p.entity.position.z));
}

function moveToGuardPos() {
    if (guardPos && bot.pathfinder) bot.pathfinder.setGoal(new GoalBlock(guardPos.x, guardPos.y, guardPos.z));
}

async function clearInventoryTrash() {
    const items = bot.inventory.items().filter(item => TRASH_ITEMS.includes(item.name));
    if (items.length === 0) return;
    for (const item of items) { try { await bot.tossStack(item); await bot.waitForTicks(4); } catch (err) {} }
}

async function activeMiningRoutine() {
    if (!miningMode) return;
    const list = ['iron_ore', 'deepslate_iron_ore', 'diamond_ore', 'deepslate_diamond_ore', 'gold_ore', 'deepslate_gold_ore', 'stone', 'deepslate'];
    const ids = list.map(n => mcData.blocksByName[n]?.id).filter(Boolean);
    const b = bot.findBlock({ matching: ids, maxDistance: 32 });
    if (!b) { miningMode = false; return; }
    try {
        await bot.pathfinder.goto(new GoalLookAtBlock(b.position, bot.world));
        const p = bot.inventory.items().find(i => i.name.includes('pickaxe'));
        if (p) await bot.equip(p, 'hand');
        await bot.dig(b);
    } catch (err) {}
    setTimeout(activeMiningRoutine, 100);
}

async function dropAllExceptGear(recipientName) {
    const p = bot.players[recipientName];
    if (!p) return;
    if (!p.entity) { bot.chat(`/tpa ${recipientName}`); return; }

    buildMode = true; 
    try {
        await bot.pathfinder.goto(new GoalFollow(p.entity, 1.5));
        await bot.waitForTicks(10); 

        const keep = ['sword', 'pickaxe', 'axe', 'shovel', 'hoe', 'helmet', 'chestplate', 'leggings', 'boots', 'shield'];
        const items = bot.inventory.items().filter(item => !keep.some(kw => item.name.includes(kw)));
        if (items.length === 0) { buildMode = false; return; }

        for (const item of items) { try { await bot.tossStack(item); await bot.waitForTicks(4); } catch (err) {} }
    } catch (e) {}

    buildMode = false;
    startIdleWanderLoop();
}

async function buildBaseStructure() {
    buildMode = true; 
    bot.pathfinder.movements.canDig = true;
    const startPos = bot.entity.position.floored();
    const offsets = [];
    for (let i = 0; i < 10; i++) offsets.push({x: i, z: 0});
    for (let i = 1; i < 10; i++) offsets.push({x: 9, z: i});
    for (let i = 8; i >= 0; i--) offsets.push({x: i, z: 9});
    for (let i = 8; i > 0; i--) offsets.push({x: 0, z: i});

    for (const offset of offsets) {
        if (!buildMode) break;
        const targetBlockPos = startPos.offset(offset.x, 0, offset.z);
        const supportBlockPos = targetBlockPos.offset(0, -1, 0);
        const mat = bot.inventory.items().find(item => item.stackSize > 0 && !item.name.includes('sword') && !item.name.includes('pickaxe'));
        if (!mat) break;
        try {
            await bot.pathfinder.goto(new GoalBlock(targetBlockPos.x, targetBlockPos.y, targetBlockPos.z));
            const ref = bot.blockAt(supportBlockPos);
            if (ref && ref.name !== 'air') {
                await bot.equip(mat, 'hand');
                await bot.placeBlock(ref, new Vec3(0, 1, 0));
                await bot.waitForTicks(2);
            }
        } catch (err) {}
    }
    buildMode = false; 
    startIdleWanderLoop();
}

// ============================================================================
//  COMMAND MATRIX EXECUTIVE INTERFACE
// ============================================================================
function executeCommand(username, command, tokens, commandIdx) {
    const player = bot.players[username];
    const arg1 = tokens[commandIdx + 1]; 

    switch (command) {
        case 'help': {
            bot.chat(`/tell ${username} Commands: status, follow, stop, come, clear, dropall, mine, build, fight, guard, drop, unload, load, crystal, pvp`);
            break;
        }
        case 'load': { loadFromNearbyChest(); break; }
        case 'unload': { unloadToNearbyChest(); break; }
        case 'drop': { if (arg1) dropTargetedItem(username, arg1); break; }
        case 'clear': { clearInventoryTrash(); break; }
        case 'come': { comeToCoordinates(username); break; }
        case 'say': {
            const rawPhrase = tokens.slice(commandIdx + 1).join(' ');
            if (rawPhrase.trim().length > 0) bot.chat(rawPhrase);
            break;
        }
        case 'jump': { if (bot.entity.onGround) { bot.setControlState('jump', true); setTimeout(() => bot.setControlState('jump', false), 50); } break; }
        case 'tpa': { bot.chat(`/tpa ${arg1 ? arg1.replace(/[^a-zA-Z0-9_]/g, '') : username}`); break; }
        case 'tpaccept':
        case 'tpyes': { setTimeout(() => bot.chat('/tpaccept'), 150); break; }
        case 'go': {
            const entity = getNearestTarget(true);
            if (entity) startFighting(entity);
            break;
        }
        case 'fight': {
            if (arg1 === 'me' && player) startFighting(player.entity);
            else if (arg1 && bot.players[arg1]) startFighting(bot.players[arg1].entity);
            break;
        }
        case 'crystal': {
            const entity = arg1 && bot.players[arg1] ? bot.players[arg1].entity : getNearestTarget(true);
            if (!entity) return;
            startFighting(entity);
            startCrystalMode();
            break;
        }
        case 'pvp': {
            if (arg1 === 'crystal') {
                startCrystalMode();
            } else if (arg1 === 'sword' || arg1 === 'normal') {
                stopCrystalMode();
            }
            break;
        }
        case 'guard': { if (player) guardArea(player.entity.position); break; }
        case 'stop': { stopAllTasks(); break; }
        case 'follow': { followPlayer(arg1 || username); break; }
        case 'status': { 
            bot.chat(`[Status] Fight:${fighting}|Mode:${crystalMode?'Crystal':'Sword'}|Guard:${guardMode}|Mine:${miningMode}`); 
            break; 
        }
        case 'back': { bot.chat('/back'); break; }
        case 'mine': { miningMode = true; activeMiningRoutine(); break; }
        case 'dropall': { if (username) dropAllExceptGear(username); break; }
        case 'build': { buildBaseStructure(); break; }
    }
}

function getNearestTarget(includePlayers) {
    return bot.nearestEntity((e) => {
        if (!bot.entity || e.position.distanceTo(bot.entity.position) > VIEW_RANGE) return false;
        if (e.type !== 'player' && e.type !== 'mob') return false; 
        if (e.type === 'player' && (e.username === settings.username)) return false;
        if (e.type === 'mob' && e.displayName === 'Armor Stand') return false;
        return true;
    });
}

initBot();