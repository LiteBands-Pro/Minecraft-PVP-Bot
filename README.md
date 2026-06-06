```markdown
# Mechanical Mineflayer Bot (Action Engine)

An optimized, non-human, algorithmic implementation of a Mineflayer bot built for automated server navigation, defense, asset storage management, and high-performance automated combat routines (Sword & Crystal PvP) in Minecraft 1.21.1.

## System Configuration
The runtime state is managed via an automated profile wrapper with active port discovery and non-human telemetry logging.

```javascript
const settings = {
    username : 'Itz_Alisia',
    host     : 'hofghnnn.aternos.me',
    port     : 52677, // Auto-overridden on initialization ping
    version  : '1.21.1',
    logErrors: false  // Suppressed for silent execution
};

```

## Features & Subsystems

### 1. Automated Combat Matrix

The engine dynamically evaluates targets within a `24-block` viewport and flags aggression when under threat.

* **Sword PvP Routine:** Executes a strict 1.9+ weapon attack speed cooldown formula. Incorporates dynamic target positioning prediction factor (`1.25`), alternating strafe vectors, aggressive W-tapping (sprint resets before swing), and S-tapping spacing matrices (forced backsteps after consecutive impacts).
* **Crystal PvP Routine:** Evaluates adjacent obsidian/bedrock positions to predict explosion yield calculations using a scaled damage formula:

$$\text{Yield} = 12 \times \left(1 - \frac{\text{distance}}{12}\right) \times 0.4$$



Automatically filters placements below structural minimum thresholds or when self-inflicted blast damage limits are exceeded.

### 2. Multi-Stage Extraction Mechanics (Anti-Stuck Engine)

Monitors micro-movements on a strict physics execution tick. If forward-progress displacement drops below $0.03$ units per cycle, the following automated escape sequence tiers fire sequentially:

1. **Tier 1 (Ticks 1–2):** Vector bounce with vertical hop impulse along random lateral boundaries.
2. **Tier 2 (Tick 3):** Full inverted $180^\circ$ yaw axis rotation matched with a forced backward sprint control state.
3. **Tier 3 (Tick 4):** Vector obstruction drilling. Automatically equips nearby excavation assets (pickaxes) and isolates adjacent geometry blocks blocks obstructing head/leg height.
4. **Tier 4 (Tier 5+):** Forced tracking flush. Executes a directory reset and calls a remote fallback structural routine (`/back`).

### 3. Inventory & Structural Execution Protocols

* **Dynamic Armor Allocation:** Automatic integration with structural inventory checks to equip high-tier armor and enforce emergency off-hand Totem of Undying safety margins.
* **Storage Interactions:** Automated pathing to adjacent repository entities (chests) within a $6\text{-block}$ radius to deposit armor components, offload inventory variables, or extract materials.
* **Perimeter Construction:** Loops dynamic layout pathing vectors to drop foundational blocks across a $10 \times 10$ multi-axis spatial grid layout.
* **Waste Processing:** Drops objects matching identified scrap parameters (`cobblestone`, `dirt`, `netherrack`, etc.) to clear internal execution storage.

---

## Executive Interface Commands

Commands can be invoked directly through terminal interface pipes or parsed via running server chat triggers:

| Identifier | Parameter Matrix | Description |
| --- | --- | --- |
| `help` | None | Dispatches command directory index via secure whisper pipe. |
| `status` | None | Returns string map containing binary execution variables and current combat configurations. |
| `pvp` | `[crystal / sword]` | Forces runtime mode flip between the main weapon combat state engines. |
| `fight` | `[me / target_id]` | Forces target lock override onto specified target block entity. |
| `crystal` | `[target_id]` | Locks target entity and forces immediate initiation of crystal detonation loop. |
| `guard` | None | Establishes coordinates as active anchor position and runs threat scans for proximity actors. |
| `stop` | None | Flushes all active tracking routines, pathways, and state parameters to standby. |
| `follow` | `[target_id]` | Chains pathfinder nodes to maintain close proximity offset tracking. |
| `come` | None | Interrogates caller coordinates and computes pathfinder traversal nodes directly to target. |
| `mine` | None | Scans 32-block radius for defined ore geometries and enters an active extraction loop. |
| `build` | None | Starts perimeter construction routines on local spatial coordinates. |
| `load` | None | Extracts container variables from structural chest units into active slots. |
| `unload` | None | Purges non-essential loose items into adjacent chest containers. |
| `drop` | `[item_name]` | Expels item structural stacks matching criteria to recipient proximity space. |
| `dropall` | None | Paths to operator and drops all items except specific tactical configuration tools. |
| `clear` | None | Iterates trash list arrays and purges inventory space. |
| `back` | None | Issues baseline structural navigation override script command. |
| `say` | `[phrase]` | Relays literal data strings back into the server chat channel. |

```

```