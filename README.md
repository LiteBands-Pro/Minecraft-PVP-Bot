# ⚔️ PvP Bot — Mineflayer Minecraft Bot

A feature-rich Minecraft PvP bot built with [Mineflayer](https://github.com/PrismarineJS/mineflayer). It supports sword combat, crystal PvP, auto-armor, auto-eat, pathfinding, guard mode, mining, chest interaction, and more — all controllable via in-game chat commands.

---

## 📦 Requirements

- [Node.js](https://nodejs.org/) v16 or higher
- A Minecraft Java Edition account (or cracked server)
- Minecraft Java **1.21.1** server

---

## 🚀 Installation

1. **Clone or download** the project folder and place `pvp-bot.js` inside it.

2. **Initialize a Node.js project** (if you haven't already):
   ```bash
   npm init -y
   ```

3. **Install dependencies:**
   ```bash
   npm install mineflayer mineflayer-pathfinder mineflayer-pvp mineflayer-armor-manager minecraft-protocol minecraft-data vec3
   ```

4. **Configure the bot** by editing the top of `pvp-bot.js`:
   ```js
   const PASSWORD = 'your_password_here';

   const settings = {
       username : 'YourBotName',
       host     : 'your.server.address',
       port     : 25565,       // your server port
       version  : '1.21.1',
   };
   ```

5. **Run the bot:**
   ```bash
   node pvp-bot.js
   ```

The bot will automatically connect, log in (using `/login` and `/register`), equip armor, and begin idling.

---

## 💬 Chat Commands

Control the bot by typing commands in Minecraft chat. The bot reads public chat and detects its name or commands from any player.

| Command | Description |
|---|---|
| `help` | Shows a list of all available commands |
| `status` | Reports current fight/mode/guard/mine state |
| `go` | Attack the nearest entity |
| `fight <player>` | Attack a specific player (or `fight me`) |
| `stop` | Stop all current tasks |
| `follow [player]` | Follow a player (defaults to you) |
| `come` | Teleport/pathfind to your position |
| `guard` | Guard your current location, attacking nearby threats |
| `mine` | Start mining nearby ores (iron, gold, diamonds) |
| `build` | Build a 10×10 base structure from inventory blocks |
| `crystal [player]` | Switch to End Crystal PvP mode and attack target |
| `pvp crystal` | Enable crystal PvP mode |
| `pvp sword` | Switch back to sword PvP mode |
| `load` | Pull all items from a nearby chest |
| `unload` | Deposit non-gear items into a nearby chest |
| `drop <item>` | Drop a specific item from inventory |
| `dropall` | Drop all non-gear items to you |
| `clear` | Discard trash items from inventory |
| `tpa <player>` | Send a `/tpa` request to a player |
| `tpaccept` / `tpyes` | Accept a pending teleport request |
| `back` | Run `/back` (for death-point return plugins) |
| `say <message>` | Make the bot say something in chat |
| `jump` | Make the bot jump |

---

## ⚔️ Combat System

### Sword Mode (default)
- Automatic weapon selection (prefers netherite → diamond → iron sword)
- Critical hit jumping with configurable timing
- W-tap and S-tap combos for knockback control
- Randomized strafing (left, right, or forward)
- Predictive aim with velocity-based lead calculation
- Auto-shield equip when out of melee range

### Crystal PvP Mode
- Places End Crystals on obsidian/bedrock near the target
- Instantly breaks crystals near the target for burst damage
- Self-damage safety limit to avoid killing itself
- Automatically repositions to stay in optimal crystal range

### Survival Mechanics
- **Flee mode** — sprints away when health drops to ≤ 8 HP, re-engages at 12+ HP
- **Auto-eat** — eats best available food (golden apple > golden carrot > cooked meats…)
- **Auto-totem** — keeps Totem of Undying equipped in the off-hand
- **Auto-armor** — equips the best available armor on spawn, item pickup, or damage

---

## 🧠 AI & Navigation

- Uses `mineflayer-pathfinder` for intelligent movement
- Avoids lava, cacti, sweet berry bushes, and leaf blocks
- **Stuck detection** — multi-stage recovery: random direction dodge → back-jump → block-dig → `/back` command
- **Idle wander** — randomly explores when not in combat or a task

---

## 📁 Project Structure

```
your-project/
├── pvp-bot.js       # Main bot file
├── package.json
└── node_modules/
```

---

## ⚠️ Notes

- The bot auto-accepts `/tpa` requests from any player — use carefully on public servers.
- Crystal PvP requires End Crystals in the bot's inventory and obsidian/bedrock under the target.
- The `build` command uses whatever non-gear blocks are currently in inventory.
- Type messages directly in the terminal to send chat as the bot.
- The bot automatically reconnects after disconnection (5-second delay).
