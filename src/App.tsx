/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Skull, 
  Shield, 
  Zap, 
  Map as MapIcon, 
  ChevronRight, 
  ChevronLeft, 
  ChevronUp, 
  ChevronDown,
  Package,
  Crosshair,
  AlertTriangle,
  LogOut,
  RefreshCw,
  Eye,
  ShieldAlert,
  Bomb,
  Target,
  Warehouse,
  HeartPulse,
  Users,
  Timer,
  TowerControl,
  Mountain,
  Building,
  Radio
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

type NodeType = 'empty' | 'supply' | 'armory' | 'special_armory' | 'encounter' | 'event' | 'exit' | 'start' | 'artillery' | 'ruins' | 'medical_point' | 'refugee_point' | 'command_center' | 'mountain' | 'city' | 'sos';

interface Node {
  id: string;
  x: number;
  y: number;
  type: NodeType;
  isExplored: boolean;
  isOccupiedByAbyss: boolean;
  isTargeted?: boolean; // For artillery targeting UI
}

interface GameState {
  playerPos: { x: number; y: number };
  hp: number;
  maxHp: number;
  san: number;
  maxSan: number;
  ammo: number;
  shards: number;
  medKits: number; // New: Medical kits
  waitingTurns: number; // New: Turns to wait at refugee point
  artilleryStrikes: number; // New: Available strikes
  sosRemainingTurns: number; // New: SOS signal duration
  isTargeting: boolean; // New: Targeting mode state
  damageReduction: number;
  moveSanCost: number;
  barrierColumn: number;
  barrierDurability: number;
  turn: number;
  abyssColumn: number;
  map: Node[][];
  isGameOver: boolean;
  gameStatus: 'playing' | 'won' | 'lost';
  logs: string[];
}

// --- Constants ---

const GRID_WIDTH = 20; 
const GRID_HEIGHT = 10; 
const ABYSS_SPEED = 2; 
const INITIAL_MOVE_SAN_COST = 2; 
const MOVE_HP_COST = 3; 
const UPGRADE_COST = 15;

// --- Utilities ---

const generateMap = (barrierColumn: number): Node[][] => {
  const newMap: Node[][] = [];
  const startY = Math.floor(GRID_HEIGHT / 2);
  const exitY = Math.floor(GRID_HEIGHT / 2);

  // Initialize empty map
  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row: Node[] = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
      row.push({
        id: `${x}-${y}`,
        x,
        y,
        type: 'empty',
        isExplored: x === 0 && y === startY,
        isOccupiedByAbyss: false,
      });
    }
    newMap.push(row);
  }

  // Set Start and Exit
  newMap[startY][0].type = 'start';
  newMap[exitY][GRID_WIDTH - 1].type = 'exit';
  newMap[exitY][GRID_WIDTH - 1].isExplored = true; // Mark exit as visible

  // Place Special Armory (Visible on map)
  const saX = barrierColumn + 1;
  const saY = 1;
  newMap[saY][saX].type = 'special_armory';
  newMap[saY][saX].isExplored = true;

  // Place Command Center (Visible on map, behind barrier)
  const ccX = barrierColumn + 1;
  const ccY = 6;
  newMap[ccY][ccX].type = 'command_center';
  newMap[ccY][ccX].isExplored = true;

  // Place 2 Cities (Visible on map, behind barrier)
  let citiesPlaced = 0;
  while (citiesPlaced < 2) {
    const cx = Math.floor(Math.random() * (GRID_WIDTH - (barrierColumn + 2))) + (barrierColumn + 1);
    const cy = Math.floor(Math.random() * GRID_HEIGHT);
    if (newMap[cy][cx].type === 'empty') {
      newMap[cy][cx].type = 'city';
      newMap[cy][cx].isExplored = true;
      citiesPlaced++;
    }
  }

  // Place Medical Point (Visible on map, 2 columns after barrier)
  const medX = Math.min(GRID_WIDTH - 2, barrierColumn + 2);
  const medY = Math.floor(Math.random() * GRID_HEIGHT);
  newMap[medY][medX].type = 'medical_point';
  newMap[medY][medX].isExplored = true;

  // Place 2 Refugee Points (Visible on map, behind barrier)
  let refugeesPlaced = 0;
  while (refugeesPlaced < 2) {
    const rx = Math.floor(Math.random() * (GRID_WIDTH - (barrierColumn + 1))) + (barrierColumn + 1);
    const ry = Math.floor(Math.random() * GRID_HEIGHT);
    if (newMap[ry][rx].type === 'empty') {
      newMap[ry][rx].type = 'refugee_point';
      newMap[ry][rx].isExplored = true;
      refugeesPlaced++;
    }
  }

  // Place 8 Mountain Nodes (Visible on map, left of barrier, no monsters, may have supplies)
  let mountainsPlaced = 0;
  while (mountainsPlaced < 8) {
    const rx = Math.floor(Math.random() * (barrierColumn - 1)) + 1;
    const ry = Math.floor(Math.random() * GRID_HEIGHT);
    if (newMap[ry][rx].type === 'empty') {
      newMap[ry][rx].type = 'mountain';
      newMap[ry][rx].isExplored = true;
      mountainsPlaced++;
    }
  }

  // Place 8 Artillery Items randomly
  let artilleryPlaced = 0;
  while (artilleryPlaced < 8) {
    const rx = Math.floor(Math.random() * (GRID_WIDTH - 2)) + 1;
    const ry = Math.floor(Math.random() * GRID_HEIGHT);
    if (newMap[ry][rx].type === 'empty') {
      newMap[ry][rx].type = 'artillery';
      artilleryPlaced++;
    }
  }

  // Fill rest of the map
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (newMap[y][x].type !== 'empty') continue;
      if ((x === 0 && y === startY) || (x === GRID_WIDTH - 1 && y === exitY)) continue;

      const rand = Math.random();
      if (rand < 0.10) newMap[y][x].type = 'supply';
      else if (rand < 0.22) newMap[y][x].type = 'armory';
      else if (rand < 0.60) newMap[y][x].type = 'encounter';
      else if (rand < 0.85) newMap[y][x].type = 'event';
    }
  }

  return newMap;
};

// --- Main Component ---

export default function App() {
  const [state, setState] = useState<GameState>(() => {
    const barrierColumn = Math.floor(Math.random() * 4) + 9;
    return {
      playerPos: { x: 0, y: 5 },
      hp: 100,
      maxHp: 100,
      san: 100,
      maxSan: 100,
      ammo: 10,
      shards: 0,
      medKits: 0,
      waitingTurns: 0,
      artilleryStrikes: 0,
      sosRemainingTurns: 0,
      isTargeting: false,
      damageReduction: 0,
      moveSanCost: INITIAL_MOVE_SAN_COST,
      barrierColumn,
      barrierDurability: 3,
      turn: 0,
      abyssColumn: -1,
      map: generateMap(barrierColumn),
      isGameOver: false,
      gameStatus: 'playing',
      logs: ['你醒来在深渊的边缘。前方有一道旧时代的防线。'],
    };
  });

  const addLog = (msg: string) => {
    setState(prev => ({
      ...prev,
      logs: [msg, ...prev.logs].slice(0, 5)
    }));
  };

  const useMedKit = () => {
    if (state.medKits <= 0) return;
    if (state.hp >= state.maxHp) {
      addLog('你的身体已经很健康了。');
      return;
    }
    setState(prev => ({
      ...prev,
      medKits: prev.medKits - 1,
      hp: Math.min(prev.maxHp, prev.hp + 20)
    }));
    addLog('使用了医疗包，伤口开始愈合。');
  };

  const handleWait = () => {
    if (state.waitingTurns <= 0 || state.gameStatus !== 'playing') return;

    setState(prev => {
      const newTurn = prev.turn + 1;
      let newAbyssColumn = prev.abyssColumn;
      let newBarrierDurability = prev.barrierDurability;
      let newWaitingTurns = prev.waitingTurns - 1;
      let newHp = prev.hp;
      let newSan = prev.san;
      let newMap = prev.map;
      let newSosRemainingTurns = prev.sosRemainingTurns;

      // Abyss Advance Logic
      if (newTurn % ABYSS_SPEED === 0) {
        if (newAbyssColumn + 1 === prev.barrierColumn && newBarrierDurability > 0) {
          newBarrierDurability -= 1;
        } else {
          newAbyssColumn += 1;
        }
      }

      // SOS Logic
      if (newSosRemainingTurns > 0) {
        newSosRemainingTurns -= 1;
        if (newSosRemainingTurns === 0) {
          newMap = newMap.map(row => row.map(node => node.type === 'sos' ? { ...node, type: 'ruins' } : node));
          addLog('SOS信号消失了。');
        }
      } else if (newSosRemainingTurns === 0 && Math.random() < 0.4) {
        const possibleNodes: {x: number, y: number}[] = [];
        for (let y = 0; y < GRID_HEIGHT; y++) {
          for (let x = newAbyssColumn + 1; x < GRID_WIDTH - 1; x++) {
            if (x === prev.playerPos.x && y === prev.playerPos.y) continue;
            if (newMap[y][x].type === 'empty' || newMap[y][x].type === 'ruins') {
              possibleNodes.push({x, y});
            }
          }
        }
        if (possibleNodes.length > 0) {
          const pick = possibleNodes[Math.floor(Math.random() * possibleNodes.length)];
          newMap = newMap.map(row => row.map(node => node.x === pick.x && node.y === pick.y ? { ...node, type: 'sos', isExplored: true } : node));
          newSosRemainingTurns = 4;
          addLog('接收到微弱的SOS信号！位置已在地图上标出。');
        }
      }

      if (newWaitingTurns === 0) {
        newHp = Math.min(prev.maxHp, prev.hp + 15);
        newSan = Math.min(prev.maxSan, prev.san + 10);
        addLog('休整结束，你感到精神焕发，体力也有所恢复。');
      } else {
        addLog(`正在原地休整... 剩余 ${newWaitingTurns} 回合。`);
      }

      // Check Death
      let newStatus = prev.gameStatus;
      if (prev.playerPos.x <= newAbyssColumn) {
        newStatus = 'lost';
        addLog('黑暗追上了你，你成为了深渊的一部分。');
      }

      return {
        ...prev,
        turn: newTurn,
        abyssColumn: newAbyssColumn,
        barrierDurability: newBarrierDurability,
        waitingTurns: newWaitingTurns,
        hp: newHp,
        san: newSan,
        map: newMap,
        sosRemainingTurns: newSosRemainingTurns,
        gameStatus: newStatus
      };
    });
  };

  const toggleTargeting = () => {
    if (state.artilleryStrikes <= 0) {
      addLog('没有可用的火炮打击。');
      return;
    }
    setState(prev => ({ ...prev, isTargeting: !prev.isTargeting }));
  };

  const handleArtilleryStrike = (x: number, y: number) => {
    if (!state.isTargeting || state.artilleryStrikes <= 0) return;

    setState(prev => {
      const newMap = prev.map.map((row, ry) => 
        row.map((node, rx) => {
          if (rx === x && ry === y) {
            return { ...node, type: 'ruins' as NodeType };
          }
          return node;
        })
      );

      addLog(`火炮打击！坐标 (${x}, ${y}) 已被清理。`);
      return {
        ...prev,
        artilleryStrikes: prev.artilleryStrikes - 1,
        isTargeting: false,
        map: newMap
      };
    });
  };

  const handleUpgrade = (type: 'hp' | 'combat' | 'san') => {
    if (state.shards < UPGRADE_COST) return;

    setState(prev => {
      const newState = { ...prev, shards: prev.shards - UPGRADE_COST };
      if (type === 'hp') {
        newState.maxHp += 25;
        newState.hp = Math.min(newState.maxHp, newState.hp + 40);
        addLog('强化生命：最大生命值提升，伤口正在愈合。');
      } else if (type === 'combat') {
        newState.damageReduction = Math.min(0.7, prev.damageReduction + 0.15);
        addLog('强化战斗：外骨骼装甲加固，受到的伤害降低。');
      } else if (type === 'san') {
        newState.moveSanCost = Math.max(0, prev.moveSanCost - 0.5);
        newState.san = Math.min(prev.maxSan, prev.san + 20);
        addLog('强化意志：精神屏障稳固，理智流失减缓。');
      }
      return newState;
    });
  };

  const handleMove = useCallback((dx: number, dy: number) => {
    if (state.gameStatus !== 'playing' || state.waitingTurns > 0) return;

    const newX = state.playerPos.x + dx;
    const newY = state.playerPos.y + dy;

    // Boundary check
    if (newX < 0 || newX >= GRID_WIDTH || newY < 0 || newY >= GRID_HEIGHT) return;

    // Abyss check
    if (newX <= state.abyssColumn) {
      addLog('你试图进入已被深渊吞噬的区域，那里只有虚无。');
      return;
    }

    const targetNode = state.map[newY][newX];
    const newTurn = state.turn + 1;
    let newAbyssColumn = state.abyssColumn;
    let newHp = state.hp - MOVE_HP_COST;
    let newSan = state.san - (targetNode.type === 'ruins' ? 0 : state.moveSanCost);
    let newAmmo = state.ammo;
    let newShards = state.shards;
    let newArtilleryStrikes = state.artilleryStrikes;
    let newMedKits = state.medKits;
    let newWaitingTurns = state.waitingTurns;
    let newBarrierDurability = state.barrierDurability;
    let newStatus = state.gameStatus;
    let newSosRemainingTurns = state.sosRemainingTurns;

    // Create a copy of the map to avoid direct mutations
    let newMap = state.map.map(row => row.map(node => ({ ...node })));

    // Node Interaction
    switch (targetNode.type) {
      case 'supply':
        newHp = Math.min(state.maxHp, newHp + 12);
        newSan = Math.min(state.maxSan, newSan + 8);
        addLog('你发现了一些陈旧的补给。');
        break;
      case 'armory':
        newAmmo += 4;
        addLog('你捡到了一些弹药。');
        break;
      case 'special_armory':
        newArtilleryStrikes += 3;
        newAmmo += 5;
        newHp = Math.min(state.maxHp, newHp + 15);
        newSan = Math.min(state.maxSan, newSan + 10);
        addLog('你找到了前哨军械库！获得了大量补给和火炮支援。');
        newMap[newY][newX].type = 'ruins';
        break;
      case 'medical_point':
        newMedKits += 2;
        addLog('你找到了医疗站，获得了两个医疗包。');
        newMap[newY][newX].type = 'ruins';
        break;
      case 'command_center':
        newBarrierDurability += 2;
        addLog('你抵达了前线指挥部！防线得到了加固。');
        newMap[newY][newX].type = 'ruins';
        break;
      case 'refugee_point':
        newWaitingTurns = 3;
        addLog('你遇到了撤离的难民，决定原地停留协助他们撤离。');
        break;
      case 'mountain':
        newWaitingTurns = 1;
        if (Math.random() < 0.4) {
          newHp = Math.min(state.maxHp, newHp + 8);
          addLog('翻越山区虽然辛苦，但你发现了一些遗留的物资。');
        } else {
          addLog('山区崎岖难行，你不得不原地休整以寻找出路。');
        }
        break;
      case 'city':
        newWaitingTurns = 1;
        newShards += 10;
        addLog('你进入了一座废弃城市，在搜寻物资时被迫滞留，但获得了10个碎片。');
        newMap[newY][newX].type = 'ruins';
        break;
      case 'sos':
        newWaitingTurns = 1;
        if (newAmmo > 0) {
          newAmmo -= 1;
          newShards += 5;
          addLog('你响应了SOS信号并提供了弹药支援，获得了5个碎片作为谢礼。');
        } else {
          addLog('你响应了SOS信号，但你没有多余的弹药可以提供。');
        }
        newMap[newY][newX].type = 'ruins';
        newSosRemainingTurns = 0; // SOS handled
        break;
      case 'artillery':
        newArtilleryStrikes += 1;
        addLog('你捡到了火炮打击道具！');
        break;
      case 'encounter':
        const ammoPenalty = state.ammo <= 0 ? 3 : 1;
        const baseDmg = Math.floor(Math.random() * 20) + 15;
        const baseSanDmg = Math.floor(Math.random() * 10) + 5;
        const dmg = Math.floor(baseDmg * ammoPenalty * (1 - state.damageReduction));
        const sanDmg = Math.floor(baseSanDmg * ammoPenalty * (1 - state.damageReduction / 2));
        newHp -= dmg;
        newSan -= sanDmg;
        newAmmo -= 1;
        newShards += Math.floor(Math.random() * 6) + 8;
        if (state.ammo <= 0) {
          addLog(`无弹药肉搏！损失：${dmg} HP 和 ${sanDmg} SAN。获得碎片。`);
        } else {
          addLog(`遭遇先遣部队！损失：${dmg} HP 和 ${sanDmg} SAN。获得碎片。`);
        }
        break;
      case 'event':
        const eventRand = Math.random();
        if (eventRand > 0.4) {
          newSan -= 25;
          newHp -= 10;
          addLog('深渊的低语让你头痛欲裂。');
        } else {
          newHp += 5;
          newShards += 5;
          addLog('你发现了一处微弱的火光，捡到了一些碎片。');
        }
        break;
      case 'ruins':
        addLog('你走过废墟，这里没有任何威胁。');
        break;
      case 'exit':
        newStatus = 'won';
        addLog('你抵达了逃生点！');
        break;
    }

    // Abyss Advance Logic
    if (newTurn % ABYSS_SPEED === 0) {
      if (newAbyssColumn + 1 === state.barrierColumn && newBarrierDurability > 0) {
        newBarrierDurability -= 1;
        addLog(`深渊主力撞击了防线！防线耐久剩余: ${newBarrierDurability}`);
      } else {
        newAbyssColumn += 1;
        addLog('深渊主力正在推进，黑暗吞噬了后方的土地！');
        
        // Destroy special nodes hit by Abyss
        newMap.forEach(row => {
          row.forEach(node => {
            if (node.x === newAbyssColumn && ['special_armory', 'medical_point', 'command_center', 'city', 'sos'].includes(node.type)) {
              const typeName = node.type === 'special_armory' ? '军械库' : node.type === 'medical_point' ? '医疗站' : node.type === 'command_center' ? '指挥部' : node.type === 'city' ? '城市' : 'SOS信号源';
              addLog(`噩耗：${typeName}已被深渊主力摧毁！`);
              node.type = 'ruins';
            }
          });
        });
      }
    }

    // SOS Logic
    if (newSosRemainingTurns > 0) {
      newSosRemainingTurns -= 1;
      if (newSosRemainingTurns === 0) {
        newMap = newMap.map(row => row.map(node => node.type === 'sos' ? { ...node, type: 'ruins' } : node));
        addLog('SOS信号消失了。');
      }
    } else if (newSosRemainingTurns === 0 && Math.random() < 0.4) {
      const possibleNodes: {x: number, y: number}[] = [];
      for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = newAbyssColumn + 1; x < GRID_WIDTH - 1; x++) {
          if (x === newX && y === newY) continue;
          if (newMap[y][x].type === 'empty' || newMap[y][x].type === 'ruins') {
            possibleNodes.push({x, y});
          }
        }
      }
      if (possibleNodes.length > 0) {
        const pick = possibleNodes[Math.floor(Math.random() * possibleNodes.length)];
        newMap = newMap.map(row => row.map(node => node.x === pick.x && node.y === pick.y ? { ...node, type: 'sos', isExplored: true } : node));
        newSosRemainingTurns = 4;
        addLog('接收到微弱的SOS信号！位置已在地图上标出。');
      }
    }

    // Check Death (Only if not already won)
    if (newStatus !== 'won') {
      if (newHp <= 0 || newSan <= 0 || newX <= newAbyssColumn) {
        newStatus = 'lost';
        if (newX <= newAbyssColumn) addLog('黑暗追上了你，你成为了深渊的一部分。');
        else addLog('你的意志或肉体已经崩溃。');
      }
    }

    // Update Map (Exploration)
    newMap[newY][newX].isExplored = true;

    setState(prev => ({
      ...prev,
      playerPos: { x: newX, y: newY },
      hp: newHp,
      san: newSan,
      ammo: Math.max(0, newAmmo),
      shards: newShards,
      artilleryStrikes: newArtilleryStrikes,
      medKits: newMedKits,
      waitingTurns: newWaitingTurns,
      barrierDurability: newBarrierDurability,
      turn: newTurn,
      abyssColumn: newAbyssColumn,
      map: newMap,
      sosRemainingTurns: newSosRemainingTurns,
      gameStatus: newStatus,
    }));
  }, [state]);

  const resetGame = () => {
    const startY = Math.floor(GRID_HEIGHT / 2);
    const barrierColumn = Math.floor(Math.random() * 4) + 9;
    setState({
      playerPos: { x: 0, y: startY },
      hp: 100,
      maxHp: 100,
      san: 100,
      maxSan: 100,
      ammo: 10,
      shards: 0,
      medKits: 0,
      waitingTurns: 0,
      artilleryStrikes: 0,
      sosRemainingTurns: 0,
      isTargeting: false,
      damageReduction: 0,
      moveSanCost: INITIAL_MOVE_SAN_COST,
      barrierColumn,
      barrierDurability: 3,
      turn: 0,
      abyssColumn: -1,
      map: generateMap(barrierColumn),
      isGameOver: false,
      gameStatus: 'playing',
      logs: ['轮回再次开始。'],
    });
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp': case 'w': handleMove(0, -1); break;
        case 'ArrowDown': case 's': handleMove(0, 1); break;
        case 'ArrowLeft': case 'a': handleMove(-1, 0); break;
        case 'ArrowRight': case 'd': handleMove(1, 0); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMove]);

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-zinc-300 font-sans selection:bg-purple-900/30 overflow-hidden flex flex-col">
      
      {/* Header / Stats */}
      <header className="border-b border-zinc-800/50 bg-[#0d0d0f] p-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-950/30 border border-purple-500/30 flex items-center justify-center">
            <Skull className="text-purple-400 w-6 h-6" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest uppercase text-zinc-100">逃离深渊</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-tighter">Abyss Escape Protocol v1.1</p>
          </div>
        </div>

        <div className="flex gap-8">
          <StatItem icon={<Shield className="w-4 h-4 text-emerald-500" />} label="生命" value={state.hp} max={state.maxHp} color="bg-emerald-500" />
          <StatItem icon={<Eye className="w-4 h-4 text-blue-400" />} label="理智" value={state.san} max={state.maxSan} color="bg-blue-400" />
          <StatItem icon={<Zap className="w-4 h-4 text-purple-400" />} label="碎片" value={state.shards} isRaw />
          <StatItem icon={<Crosshair className="w-4 h-4 text-amber-500" />} label="弹药" value={state.ammo} isRaw />
          <StatItem icon={<Bomb className="w-4 h-4 text-red-400" />} label="火炮" value={state.artilleryStrikes} isRaw />
          <StatItem icon={<HeartPulse className="w-4 h-4 text-pink-400" />} label="医疗包" value={state.medKits} isRaw />
        </div>
      </header>

      {/* Main Game Area */}
      <main className="flex-1 relative flex flex-col items-center justify-center p-4 gap-6">
        
        {/* The Grid Map */}
        <div 
          className="relative grid gap-1.5 p-3 bg-zinc-900/20 rounded-2xl border border-zinc-800/30 backdrop-blur-sm"
          style={{ 
            gridTemplateColumns: `repeat(${GRID_WIDTH}, minmax(0, 1fr))`,
            width: 'fit-content'
          }}
        >
          {state.map.map((row, y) => (
            row.map((node, x) => (
              <NodeCard 
                key={node.id} 
                node={node} 
                isPlayer={state.playerPos.x === x && state.playerPos.y === y}
                isAbyss={x <= state.abyssColumn}
                isTargeting={state.isTargeting}
                onClick={() => {
                  if (state.isTargeting) {
                    handleArtilleryStrike(x, y);
                  } else {
                    const dx = x - state.playerPos.x;
                    const dy = y - state.playerPos.y;
                    if (Math.abs(dx) + Math.abs(dy) === 1) handleMove(dx, dy);
                  }
                }}
              />
            ))
          ))}

          {/* Abyss Shadow Overlay */}
          <motion.div 
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-950/60 to-transparent pointer-events-none border-r border-purple-500/20"
            initial={false}
            animate={{ 
              width: `${((state.abyssColumn + 1) / GRID_WIDTH) * 100}%`,
              opacity: state.abyssColumn >= 0 ? 1 : 0
            }}
            transition={{ type: 'spring', stiffness: 50, damping: 20 }}
          />

          {/* Barrier Indicator */}
          <AnimatePresence>
            {state.barrierDurability > 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-y-0 pointer-events-none z-10 flex items-center"
                style={{ left: `${(state.barrierColumn / GRID_WIDTH) * 100}%` }}
              >
                <div className="h-full w-1.5 bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.9)] animate-pulse" />
                <div className="ml-2 px-2 py-1 bg-blue-900/90 border border-blue-500/50 rounded text-[10px] font-bold text-blue-100 uppercase tracking-widest whitespace-nowrap">
                  旧时代防线: 耐久 {state.barrierDurability}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Upgrade Terminal */}
        <div className="flex gap-4 p-4 bg-zinc-900/40 rounded-2xl border border-zinc-800/50 backdrop-blur-sm">
          <div className="flex flex-col justify-center px-4 border-r border-zinc-800/50">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">强化终端</span>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-400" />
              <span className="text-lg font-mono text-zinc-100">{state.shards}</span>
            </div>
          </div>
          
          <UpgradeButton 
            label="生命强化" 
            desc="+25 Max HP" 
            cost={UPGRADE_COST} 
            disabled={state.shards < UPGRADE_COST} 
            onClick={() => handleUpgrade('hp')}
            icon={<Shield className="w-4 h-4" />}
          />
          <UpgradeButton 
            label="战斗强化" 
            desc={`-${Math.round(state.damageReduction * 100)}% 伤害`} 
            cost={UPGRADE_COST} 
            disabled={state.shards < UPGRADE_COST || state.damageReduction >= 0.7} 
            onClick={() => handleUpgrade('combat')}
            icon={<Crosshair className="w-4 h-4" />}
          />
          <UpgradeButton 
            label="意志强化" 
            desc={`-${state.moveSanCost.toFixed(1)} SAN/步`} 
            cost={UPGRADE_COST} 
            disabled={state.shards < UPGRADE_COST || state.moveSanCost <= 0.5} 
            onClick={() => handleUpgrade('san')}
            icon={<Eye className="w-4 h-4" />}
          />
          
          <div className="w-px bg-zinc-800/50 mx-2" />
          
          <button 
            onClick={useMedKit}
            disabled={state.medKits <= 0 || state.hp >= state.maxHp}
            className={`
              flex flex-col items-start p-3 rounded-xl border transition-all w-36
              ${state.medKits > 0 && state.hp < state.maxHp
                ? 'bg-zinc-800/40 border-zinc-700/50 hover:bg-zinc-700/60 hover:border-pink-500/50' 
                : 'bg-zinc-900/20 border-zinc-800/50 opacity-40 grayscale cursor-not-allowed'}
            `}
          >
            <div className="flex items-center gap-2 mb-1">
              <HeartPulse className="w-4 h-4 text-pink-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-100">使用医疗包</span>
            </div>
            <span className="text-[10px] text-zinc-500 mb-2">恢复 20 HP</span>
            <div className="mt-auto flex items-center gap-1">
              <span className="text-xs font-mono text-zinc-300">持有: {state.medKits}</span>
            </div>
          </button>

          <button 
            onClick={toggleTargeting}
            disabled={state.artilleryStrikes <= 0}
            className={`
              flex flex-col items-start p-3 rounded-xl border transition-all w-36
              ${state.isTargeting 
                ? 'bg-red-950/40 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' 
                : state.artilleryStrikes > 0 
                  ? 'bg-zinc-800/40 border-zinc-700/50 hover:bg-zinc-700/60 hover:border-red-500/50' 
                  : 'bg-zinc-900/20 border-zinc-800/50 opacity-40 grayscale cursor-not-allowed'}
            `}
          >
            <div className="flex items-center gap-2 mb-1">
              <Bomb className={`w-4 h-4 ${state.isTargeting ? 'text-red-400 animate-pulse' : 'text-red-500'}`} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-100">火炮打击</span>
            </div>
            <span className="text-[10px] text-zinc-500 mb-2">{state.isTargeting ? '请选择目标' : '清理节点怪物'}</span>
            <div className="mt-auto flex items-center gap-1">
              <span className="text-xs font-mono text-zinc-300">可用: {state.artilleryStrikes}</span>
            </div>
          </button>
        </div>

        {/* Game Over Overlays */}
        <AnimatePresence>
          {state.gameStatus !== 'playing' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
            >
              <div className="text-center p-12 rounded-3xl border border-zinc-800 bg-zinc-900/50 shadow-2xl max-w-md">
                {state.gameStatus === 'won' ? (
                  <>
                    <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/50">
                      <LogOut className="text-emerald-400 w-10 h-10" />
                    </div>
                    <h2 className="text-3xl font-serif italic mb-4 text-emerald-100">逃出生天</h2>
                    <p className="text-zinc-400 mb-8 leading-relaxed">你穿过了黑暗的帷幕，虽然身上带着永恒的伤痕，但你活了下来。</p>
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/50">
                      <Skull className="text-red-400 w-10 h-10" />
                    </div>
                    <h2 className="text-3xl font-serif italic mb-4 text-red-100">深渊永恒</h2>
                    <p className="text-zinc-400 mb-8 leading-relaxed">黑暗最终还是追上了你。你的名字将被遗忘在虚无之中。</p>
                  </>
                )}
                <button 
                  onClick={resetGame}
                  className="w-full py-4 bg-zinc-100 text-black rounded-xl font-bold hover:bg-white transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-5 h-5" />
                  再次尝试
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer / Logs & Controls */}
      <footer className="h-40 border-t border-zinc-800/50 bg-[#0d0d0f] p-6 flex gap-8">
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">生存日志</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-4 custom-scrollbar">
            {state.logs.map((log, i) => (
              <motion.p 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                key={i} 
                className={`text-sm ${i === 0 ? 'text-zinc-100 font-medium' : 'text-zinc-600'}`}
              >
                {log}
              </motion.p>
            ))}
          </div>
        </div>

        <div className="w-48 flex flex-col items-center justify-center gap-4">
          {state.waitingTurns > 0 ? (
            <button 
              onClick={handleWait}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all flex flex-col items-center justify-center gap-1 shadow-[0_0_20px_rgba(37,99,235,0.3)]"
            >
              <div className="flex items-center gap-2">
                <Timer className="w-5 h-5 animate-spin-slow" />
                <span>原地休整中</span>
              </div>
              <span className="text-[10px] opacity-80 uppercase tracking-tighter">剩余 {state.waitingTurns} 回合</span>
            </button>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div />
              <ControlButton icon={<ChevronUp />} onClick={() => handleMove(0, -1)} />
              <div />
              <ControlButton icon={<ChevronLeft />} onClick={() => handleMove(-1, 0)} />
              <ControlButton icon={<ChevronDown />} onClick={() => handleMove(0, 1)} />
              <ControlButton icon={<ChevronRight />} onClick={() => handleMove(1, 0)} />
            </div>
          )}
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest">
            {state.waitingTurns > 0 ? '点击按钮推进回合' : 'WASD / 方向键 移动'}
          </p>
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 10px; }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
    </div>
  );
}

// --- Sub-components ---

function UpgradeButton({ label, desc, cost, disabled, onClick, icon }: { label: string, desc: string, cost: number, disabled: boolean, onClick: () => void, icon: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`
        flex flex-col items-start p-3 rounded-xl border transition-all w-36
        ${disabled 
          ? 'bg-zinc-900/20 border-zinc-800/50 opacity-40 grayscale cursor-not-allowed' 
          : 'bg-zinc-800/40 border-zinc-700/50 hover:bg-zinc-700/60 hover:border-purple-500/50 cursor-pointer'}
      `}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`${disabled ? 'text-zinc-500' : 'text-purple-400'}`}>{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-100">{label}</span>
      </div>
      <span className="text-[10px] text-zinc-500 mb-2">{desc}</span>
      <div className="mt-auto flex items-center gap-1">
        <Zap className="w-3 h-3 text-purple-500" />
        <span className="text-xs font-mono text-zinc-300">{cost}</span>
      </div>
    </button>
  );
}

function StatItem({ icon, label, value, max, color, isRaw }: { icon: React.ReactNode, label: string, value: number, max?: number, color?: string, isRaw?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>
        {isRaw && <span className="text-xs font-mono text-zinc-200">{value}</span>}
      </div>
      {!isRaw && max && (
        <div className="w-32 h-1 bg-zinc-800 rounded-full overflow-hidden">
          <motion.div 
            className={`h-full ${color}`}
            initial={false}
            animate={{ width: `${(value / max) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

interface NodeCardProps {
  node: Node;
  isPlayer: boolean;
  isAbyss: boolean;
  isTargeting: boolean;
  onClick: () => void;
}

const NodeCard: React.FC<NodeCardProps> = ({ node, isPlayer, isAbyss, isTargeting, onClick }) => {
  const getIcon = () => {
    if (isPlayer) return <motion.div layoutId="player" className="w-6 h-6 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.5)]" />;
    if (isAbyss) return null;
    
    // Targeting visual overlay
    if (isTargeting && node.isExplored && node.type !== 'start' && node.type !== 'exit') {
      return <Target className="w-5 h-5 text-red-500 animate-pulse" />;
    }

    if (!node.isExplored) return <AlertTriangle className="w-4 h-4 text-zinc-800" />;
    
    switch (node.type) {
      case 'supply': return <Package className="w-5 h-5 text-emerald-500/70" />;
      case 'armory': return <Crosshair className="w-5 h-5 text-amber-500/70" />;
      case 'encounter': return <Skull className="w-5 h-5 text-red-500/70" />;
      case 'event': return <Zap className="w-5 h-5 text-purple-500/70" />;
      case 'artillery': return <Bomb className="w-5 h-5 text-red-400" />;
      case 'medical_point': return <HeartPulse className="w-5 h-5 text-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.4)]" />;
      case 'refugee_point': return <Users className="w-5 h-5 text-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.4)]" />;
      case 'mountain': return <Mountain className="w-5 h-5 text-stone-400 shadow-[0_0_10px_rgba(120,113,108,0.4)]" />;
      case 'city': return <Building className="w-5 h-5 text-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.4)]" />;
      case 'sos': return <Radio className="w-5 h-5 text-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.4)]" />;
      case 'special_armory': return <Warehouse className="w-5 h-5 text-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]" />;
      case 'command_center': return <TowerControl className="w-5 h-5 text-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />;
      case 'ruins': return <div className="w-2 h-2 bg-zinc-700 rounded-full opacity-50" />;
      case 'exit': return <LogOut className="w-5 h-5 text-white animate-pulse" />;
      case 'start': return <MapIcon className="w-5 h-5 text-zinc-600" />;
      default: return null;
    }
  };

  return (
    <motion.button
      whileHover={!isAbyss && !isPlayer ? { scale: 1.05, backgroundColor: 'rgba(39, 39, 42, 0.5)' } : {}}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      disabled={isAbyss}
      className={`
        w-11 h-11 rounded-lg flex items-center justify-center transition-all duration-300 border
        ${isAbyss ? 'bg-black/40 border-transparent' : 'bg-zinc-900/40 border-zinc-800/50'}
        ${isPlayer ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0c]' : ''}
        ${node.isExplored && !isAbyss ? 'bg-zinc-800/20' : ''}
        ${isTargeting && !isAbyss && node.isExplored ? 'cursor-crosshair border-red-500/50 hover:border-red-500 bg-red-950/10' : ''}
        ${node.type === 'ruins' ? 'bg-zinc-950/50 opacity-60' : ''}
      `}
    >
      {getIcon()}
    </motion.button>
  );
}

function ControlButton({ icon, onClick }: { icon: React.ReactNode, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-10 h-10 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-all active:scale-90 border border-zinc-700/30"
    >
      {icon}
    </button>
  );
}
