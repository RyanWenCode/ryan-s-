/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Target, Trophy, AlertCircle, RefreshCw, Languages } from 'lucide-react';
import confetti from 'canvas-confetti';

// --- Constants & Types ---

const WIN_SCORE = 1000;
const INITIAL_AMMO = { left: 20, center: 40, right: 20 };
const EXPLOSION_RADIUS = 40;
const EXPLOSION_DURATION = 60; // frames
const ENEMY_SPEED_BASE = 0.8;
const MISSILE_SPEED = 5;

type Point = { x: number; y: number };

interface Entity {
  id: string;
  x: number;
  y: number;
}

interface EnemyRocket extends Entity {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number;
  speed: number;
}

type MissileType = 'NORMAL' | 'RARE' | 'LIGHTNING' | 'DRONE';

interface InterceptorMissile extends Entity {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number;
  type: MissileType;
  hoverTimer?: number;
  hasFired?: boolean;
}

interface Explosion extends Entity {
  radius: number;
  maxRadius: number;
  life: number; // 0 to 1
  isRare?: boolean;
}

interface City extends Entity {
  active: boolean;
}

interface Battery extends Entity {
  active: boolean;
  ammo: number;
  maxAmmo: number;
}

interface Particle extends Entity {
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

type GameState = 'START' | 'PLAYING' | 'WIN' | 'GAMEOVER';
type Language = 'zh' | 'en';

const TRANSLATIONS = {
  zh: {
    title: 'Ryan 新星防御',
    start: '开始游戏',
    win: '任务成功！',
    gameOver: '城市陷落',
    score: '得分',
    targetScore: '目标',
    ammo: '弹药',
    playAgain: '再玩一次',
    instructions: '点击屏幕发射拦截导弹。保护底部的城市和炮台。',
    winMsg: '你成功保卫了新星免受毁灭！',
    loseMsg: '所有防御塔已被摧毁。',
  },
  en: {
    title: 'Ryan Nova Defense',
    start: 'Start Game',
    win: 'Mission Success!',
    gameOver: 'Cities Fallen',
    score: 'Score',
    targetScore: 'Target',
    ammo: 'Ammo',
    playAgain: 'Play Again',
    instructions: 'Click anywhere to fire interceptors. Protect cities and batteries.',
    winMsg: 'You successfully defended Nova from destruction!',
    loseMsg: 'All defense batteries have been destroyed.',
  }
};

// --- Main Component ---

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [lang, setLang] = useState<Language>('zh');
  const [ammo, setAmmo] = useState(INITIAL_AMMO);
  const [isPaused, setIsPaused] = useState(false);
  const [isBgLoaded, setIsBgLoaded] = useState(false);
  
  // Game Objects Refs
  const enemiesRef = useRef<EnemyRocket[]>([]);
  const missilesRef = useRef<InterceptorMissile[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const citiesRef = useRef<City[]>([]);
  const batteriesRef = useRef<Battery[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const requestRef = useRef<number>(null);
  const scoreRef = useRef(0);
  const gameStateRef = useRef<GameState>('START');
  const isPausedRef = useRef(false);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const mousePosRef = useRef({ x: 0, y: 0 });

  const t = TRANSLATIONS[lang];

  // Sync refs with state
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Load background image
  useEffect(() => {
    const img = new Image();
    img.src = 'https://images.unsplash.com/photo-1614728263952-84ea256f9679?q=80&w=1920';
    img.onload = () => {
      bgImageRef.current = img;
      setIsBgLoaded(true);
    };
  }, []);

  // Initialize Game Objects (Positions and State)
  const initGame = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // 6 Cities
    const cities: City[] = [];
    const cityPositions = [0.15, 0.25, 0.35, 0.65, 0.75, 0.85];
    cityPositions.forEach((pos, i) => {
      cities.push({
        id: `city-${i}`,
        x: width * pos,
        y: height - 40,
        active: true,
      });
    });
    citiesRef.current = cities;

    // 3 Batteries
    const batteries: Battery[] = [
      { id: 'left', x: width * 0.05, y: height - 50, active: true, ammo: INITIAL_AMMO.left, maxAmmo: INITIAL_AMMO.left },
      { id: 'center', x: width * 0.5, y: height - 50, active: true, ammo: INITIAL_AMMO.center, maxAmmo: INITIAL_AMMO.center },
      { id: 'right', x: width * 0.95, y: height - 50, active: true, ammo: INITIAL_AMMO.right, maxAmmo: INITIAL_AMMO.right },
    ];
    batteriesRef.current = batteries;
    setAmmo(INITIAL_AMMO);

    enemiesRef.current = [];
    missilesRef.current = [];
    explosionsRef.current = [];
    particlesRef.current = [];
    setScore(0);
    scoreRef.current = 0;
  }, []);

  // Update positions on resize without resetting game state
  const handleResize = useCallback(() => {
    if (!canvasRef.current) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvasRef.current.width = width;
    canvasRef.current.height = height;

    // Adjust city and battery positions proportionally
    const cityPositions = [0.15, 0.25, 0.35, 0.65, 0.75, 0.85];
    citiesRef.current.forEach((city, i) => {
      city.x = width * cityPositions[i];
      city.y = height - 40;
    });

    if (batteriesRef.current.length === 3) {
      batteriesRef.current[0].x = width * 0.05;
      batteriesRef.current[0].y = height - 50;
      batteriesRef.current[1].x = width * 0.5;
      batteriesRef.current[1].y = height - 50;
      batteriesRef.current[2].x = width * 0.95;
      batteriesRef.current[2].y = height - 50;
    }
  }, []);

  const spawnEnemy = useCallback(() => {
    const width = window.innerWidth;
    
    const targets = [...citiesRef.current.filter(c => c.active), ...batteriesRef.current.filter(b => b.active)];
    if (targets.length === 0) return;

    const target = targets[Math.floor(Math.random() * targets.length)];
    
    const enemy: EnemyRocket = {
      id: Math.random().toString(36).substr(2, 9),
      startX: Math.random() * width,
      startY: -20,
      targetX: target.x,
      targetY: target.y,
      x: 0,
      y: 0,
      progress: 0,
      speed: ENEMY_SPEED_BASE + (scoreRef.current / 1000) * 0.5,
    };
    enemiesRef.current.push(enemy);
  }, []);

  const fireMissile = (targetX: number, targetY: number) => {
    if (gameStateRef.current !== 'PLAYING' || isPausedRef.current) return;

    let bestBattery: Battery | null = null;
    let minDist = Infinity;

    batteriesRef.current.forEach(b => {
      if (b.active && b.ammo > 0) {
        const dist = Math.abs(b.x - targetX);
        if (dist < minDist) {
          minDist = dist;
          bestBattery = b;
        }
      }
    });

    if (bestBattery) {
      bestBattery.ammo--;
      setAmmo({
        left: batteriesRef.current[0].ammo,
        center: batteriesRef.current[1].ammo,
        right: batteriesRef.current[2].ammo,
      });

      const rand = Math.random();
      let type: MissileType = 'NORMAL';
      if (rand < 0.1) type = 'RARE';
      else if (rand < 0.25) type = 'LIGHTNING';
      else if (rand < 0.4) type = 'DRONE';

      const missile: InterceptorMissile = {
        id: Math.random().toString(36).substr(2, 9),
        startX: bestBattery.x,
        startY: bestBattery.y,
        targetX,
        targetY,
        x: bestBattery.x,
        y: bestBattery.y,
        progress: 0,
        type,
        hoverTimer: type === 'DRONE' ? 180 : 0, // 3 seconds at 60fps
      };
      missilesRef.current.push(missile);
    }
  };

  const update = useCallback((time: number) => {
    if (gameStateRef.current !== 'PLAYING') return;
    if (isPausedRef.current) {
      requestRef.current = requestAnimationFrame(update);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const drawRocket = (x: number, y: number, angle: number, color: string, size: number = 1) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      
      // Body/Nose
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(8 * size, 0);
      ctx.lineTo(-4 * size, -4 * size);
      ctx.lineTo(-4 * size, 4 * size);
      ctx.closePath();
      ctx.fill();

      // Fins
      ctx.fillStyle = color;
      ctx.fillRect(-5 * size, -5 * size, 2 * size, 10 * size);

      // Flame
      if (Math.random() > 0.3) {
        ctx.fillStyle = '#ff4400';
        ctx.beginPath();
        ctx.moveTo(-5 * size, -2 * size);
        ctx.lineTo(-12 * size, 0);
        ctx.lineTo(-5 * size, 2 * size);
        ctx.fill();
      }
      
      ctx.restore();
    };

    // Draw Background
    if (bgImageRef.current) {
      ctx.drawImage(bgImageRef.current, 0, 0, width, height);
      // Add a dark overlay to keep gameplay visible
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
    }

    // Spawn enemies
    if (Math.random() < 0.015 + (scoreRef.current / 5000)) {
      spawnEnemy();
    }

    // Update & Draw Enemies
    enemiesRef.current = enemiesRef.current.filter(enemy => {
      const dx = enemy.targetX - enemy.startX;
      const dy = enemy.targetY - enemy.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      enemy.progress += enemy.speed / dist;
      enemy.x = enemy.startX + dx * enemy.progress;
      enemy.y = enemy.startY + dy * enemy.progress;

      ctx.beginPath();
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 1;
      ctx.moveTo(enemy.startX, enemy.startY);
      ctx.lineTo(enemy.x, enemy.y);
      ctx.stroke();

      // Draw head as rocket
      const angle = Math.atan2(dy, dx);
      drawRocket(enemy.x, enemy.y, angle, '#ff4444', 0.8);

      if (enemy.progress >= 1) {
        explosionsRef.current.push({
          id: `impact-${Math.random()}`,
          x: enemy.targetX,
          y: enemy.targetY,
          radius: 0,
          maxRadius: 30,
          life: 1,
        });

        const city = citiesRef.current.find(c => Math.abs(c.x - enemy.targetX) < 5);
        if (city) city.active = false;
        
        const battery = batteriesRef.current.find(b => Math.abs(b.x - enemy.targetX) < 5);
        if (battery) battery.active = false;

        return false;
      }
      return true;
    });

    // Update & Draw Missiles
    missilesRef.current = missilesRef.current.filter(m => {
      const dx = m.targetX - m.startX;
      const dy = m.targetY - m.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (m.progress < 1) {
        m.progress += MISSILE_SPEED / dist;
        m.x = m.startX + dx * m.progress;
        m.y = m.startY + dy * m.progress;
      }

      // Draw trail
      ctx.beginPath();
      ctx.strokeStyle = m.type === 'RARE' ? '#ffcc00' : m.type === 'LIGHTNING' ? '#00ffff' : m.type === 'DRONE' ? '#00ff00' : '#4488ff';
      ctx.lineWidth = m.type === 'RARE' ? 4 : 2;
      ctx.moveTo(m.startX, m.startY);
      ctx.lineTo(m.x, m.y);
      ctx.stroke();

      // Draw head as rocket
      const angle = Math.atan2(dy, dx);
      let rocketColor = '#4488ff';
      if (m.type === 'RARE') rocketColor = '#ffcc00';
      if (m.type === 'LIGHTNING') rocketColor = '#00ffff';
      if (m.type === 'DRONE') rocketColor = '#00ff00';
      
      drawRocket(m.x, m.y, angle, rocketColor, m.type === 'RARE' ? 1.5 : 1);

      // Draw target X
      ctx.beginPath();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.moveTo(m.targetX - 3, m.targetY - 3);
      ctx.lineTo(m.targetX + 3, m.targetY + 3);
      ctx.moveTo(m.targetX + 3, m.targetY - 3);
      ctx.lineTo(m.targetX - 3, m.targetY + 3);
      ctx.stroke();

      if (m.progress >= 1) {
        if (m.type === 'DRONE') {
          if (m.hoverTimer && m.hoverTimer > 0) {
            m.hoverTimer--;
            
            // Drone visual: pulsing circle and drone body
            ctx.save();
            ctx.translate(m.x, m.y);
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 10 + Math.sin(time / 5) * 5, 0, Math.PI * 2);
            ctx.stroke();
            
            // Draw drone legs/arms
            for (let i = 0; i < 4; i++) {
              ctx.rotate(Math.PI / 2);
              ctx.beginPath();
              ctx.moveTo(5, 0);
              ctx.lineTo(15, 0);
              ctx.stroke();
              ctx.fillStyle = '#00ff00';
              ctx.fillRect(13, -2, 4, 4);
            }
            ctx.restore();

            // Fire small sub-bombs while hovering
            if (m.hoverTimer % 20 === 0) {
              const angle = Math.random() * Math.PI * 2;
              const dist = Math.random() * 150 + 50;
              explosionsRef.current.push({
                id: `drone-sub-exp-${Math.random()}`,
                x: m.x + Math.cos(angle) * dist,
                y: m.y + Math.sin(angle) * dist,
                radius: 0,
                maxRadius: EXPLOSION_RADIUS * 0.6,
                life: 1,
              });
            }
            return true;
          } else {
            // Final burst
            for (let i = 0; i < 12; i++) {
              const angle = (i / 12) * Math.PI * 2;
              explosionsRef.current.push({
                id: `drone-final-exp-${Math.random()}`,
                x: m.x + Math.cos(angle) * 80,
                y: m.y + Math.sin(angle) * 80,
                radius: 0,
                maxRadius: EXPLOSION_RADIUS,
                life: 1,
              });
            }
            return false;
          }
        }

        if (m.type === 'RARE') {
          // Super explosion
          explosionsRef.current.push({
            id: `rare-exp-${Math.random()}`,
            x: m.x,
            y: m.y,
            radius: 0,
            maxRadius: Math.max(width, height) * 1.5, // Screen wide
            life: 1,
            isRare: true,
          });
        } else if (m.type === 'LIGHTNING') {
          // Lightning effect
          ctx.save();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 20;
          ctx.shadowColor = '#00ffff';
          
          const nearbyEnemies = enemiesRef.current.filter(e => {
            const edx = e.x - m.x;
            const edy = e.y - m.y;
            return Math.sqrt(edx * edx + edy * edy) < 300;
          });

          nearbyEnemies.forEach((e, index) => {
            if (index % 2 === 0) { // Clear half
              // Draw lightning bolt
              ctx.beginPath();
              ctx.moveTo(m.x, m.y);
              let lx = m.x;
              let ly = m.y;
              for (let j = 0; j < 5; j++) {
                lx += (e.x - lx) * 0.2 + (Math.random() - 0.5) * 40;
                ly += (e.y - ly) * 0.2 + (Math.random() - 0.5) * 40;
                ctx.lineTo(lx, ly);
              }
              ctx.lineTo(e.x, e.y);
              ctx.stroke();
              
              // Kill enemy
              enemiesRef.current = enemiesRef.current.filter(en => en.id !== e.id);
              setScore(s => s + 20);
              
              explosionsRef.current.push({
                id: `lightning-exp-${Math.random()}`,
                x: e.x,
                y: e.y,
                radius: 0,
                maxRadius: 20,
                life: 0.5,
              });
            }
          });
          ctx.restore();
          
          explosionsRef.current.push({
            id: `exp-${Math.random()}`,
            x: m.targetX,
            y: m.targetY,
            radius: 0,
            maxRadius: EXPLOSION_RADIUS,
            life: 1,
          });
        } else {
          // Normal explosion
          explosionsRef.current.push({
            id: `exp-${Math.random()}`,
            x: m.targetX,
            y: m.targetY,
            radius: 0,
            maxRadius: EXPLOSION_RADIUS,
            life: 1,
          });
        }
        return false;
      }
      return true;
    });

    // Update & Draw Explosions
    explosionsRef.current = explosionsRef.current.filter(exp => {
      const oldLife = exp.life;
      exp.life -= 1 / EXPLOSION_DURATION;
      
      // Spawn particles at the start of the explosion
      if (oldLife === 1) {
        for (let i = 0; i < 15; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 3 + 1;
          particlesRef.current.push({
            id: `p-${Math.random()}`,
            x: exp.x,
            y: exp.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            size: Math.random() * 3 + 1,
            color: `hsl(${(time / 10) % 360}, 100%, 70%)`
          });
        }
      }

      if (exp.life > 0.5) {
        exp.radius = Math.max(0, exp.maxRadius * (1 - (exp.life - 0.5) * 2));
      } else {
        exp.radius = Math.max(0, exp.maxRadius * (exp.life * 2));
      }

      // Draw multi-layered explosion
      ctx.save();
      
      // Outer glow
      ctx.beginPath();
      ctx.shadowBlur = 15;
      ctx.shadowColor = `hsla(${(time / 10) % 360}, 100%, 50%, ${exp.life})`;
      ctx.fillStyle = `hsla(${(time / 10) % 360}, 80%, 60%, ${exp.life * 0.3})`;
      ctx.arc(exp.x, exp.y, exp.radius * 1.2, 0, Math.PI * 2);
      ctx.fill();

      // Middle layer
      ctx.beginPath();
      ctx.fillStyle = `hsla(${(time / 10) % 360}, 90%, 70%, ${exp.life})`;
      ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${exp.life})`;
      ctx.arc(exp.x, exp.y, exp.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();

      // Rare bomb enemy clearing logic: clear when explosion is at peak
      if (exp.isRare && exp.life < 0.6 && exp.life > 0.4) {
        if (enemiesRef.current.length > 0) {
          setScore(s => s + enemiesRef.current.length * 20);
          enemiesRef.current = [];
        }
      }

      enemiesRef.current = enemiesRef.current.filter(enemy => {
        const edx = enemy.x - exp.x;
        const edy = enemy.y - exp.y;
        const edist = Math.sqrt(edx * edx + edy * edy);
        if (edist < exp.radius) {
          setScore(s => s + 20);
          return false;
        }
        return true;
      });

      return exp.life > 0;
    });

    // Update & Draw Particles
    particlesRef.current = particlesRef.current.filter(p => {
      p.life -= 0.02;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98; // friction
      p.vy *= 0.98;

      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      return p.life > 0;
    });

    // Draw Cities
    citiesRef.current.forEach(city => {
      if (city.active) {
        ctx.save();
        ctx.translate(city.x, city.y);
        
        // House Body
        ctx.fillStyle = '#f3f4f6';
        ctx.fillRect(-15, 0, 30, 20);
        
        // Roof
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(-18, 0);
        ctx.lineTo(18, 0);
        ctx.lineTo(0, -15);
        ctx.closePath();
        ctx.fill();
        
        // Door
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(-4, 8, 8, 12);
        
        // Windows with glow
        ctx.fillStyle = '#fef08a';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#facc15';
        ctx.fillRect(-10, 4, 6, 6);
        ctx.fillRect(4, 4, 6, 6);
        
        ctx.restore();
      }
    });

    // Draw Batteries
    batteriesRef.current.forEach(b => {
      if (b.active) {
        ctx.save();
        ctx.translate(b.x, b.y);
        
        // Base
        ctx.fillStyle = '#374151';
        ctx.beginPath();
        ctx.moveTo(-25, 20);
        ctx.lineTo(25, 20);
        ctx.lineTo(15, 0);
        ctx.lineTo(-15, 0);
        ctx.closePath();
        ctx.fill();
        
        // Mechanical details on base
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 1;
        ctx.strokeRect(-20, 5, 40, 10);
        
        // Turret Head (Rotating)
        const angle = Math.atan2(mousePosRef.current.y - b.y, mousePosRef.current.x - b.x);
        ctx.rotate(angle);
        
        // Barrel
        const gradient = ctx.createLinearGradient(0, -5, 30, 5);
        gradient.addColorStop(0, '#60a5fa');
        gradient.addColorStop(1, '#2563eb');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, -5, 35, 10);
        
        // Barrel Tip
        ctx.fillStyle = '#93c5fd';
        ctx.fillRect(32, -6, 5, 12);
        
        // Turret Body
        ctx.fillStyle = '#4b5563';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        
        // Glowing core
        ctx.fillStyle = '#60a5fa';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#3b82f6';
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
        // Ammo text
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(b.ammo.toString(), b.x, b.y + 40);
      } else {
        // Destroyed battery
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(b.x - 20, b.y + 10, 40, 10);
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.arc(b.x, b.y + 5, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Check Win/Loss
    if (scoreRef.current >= WIN_SCORE) {
      setGameState('WIN');
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 }
      });
    } else if (batteriesRef.current.every(b => !b.active)) {
      setGameState('GAMEOVER');
    }

    requestRef.current = requestAnimationFrame(update);
  }, []);

  useEffect(() => {
    if (gameState === 'PLAYING') {
      requestRef.current = requestAnimationFrame(update);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, update]);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    handleResize();
    initGame();
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize, initGame]);

  const handleCanvasClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState !== 'PLAYING') return;
    
    let x, y;
    if ('touches' in e) {
      x = e.touches[0].clientX;
      y = e.touches[0].clientY;
    } else {
      x = e.clientX;
      y = e.clientY;
    }
    fireMissile(x, y);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    mousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      mousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const startGame = () => {
    initGame();
    setGameState('PLAYING');
  };

  return (
    <div className="relative w-full h-screen bg-[#0a0a0a] overflow-hidden font-sans text-white select-none touch-none">
      {/* Game Canvas */}
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair"
        onMouseDown={handleCanvasClick}
        onTouchStart={handleCanvasClick}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
      />

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start pointer-events-none">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
            <Trophy className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-mono tracking-wider">
              {t.score}: <span className="text-yellow-400 font-bold">{score}</span>
            </span>
            <span className="text-[10px] opacity-50 ml-2">/ {WIN_SCORE}</span>
          </div>
        </div>

        <div className="flex gap-2 pointer-events-auto">
          {gameState === 'PLAYING' && (
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors border border-white/10"
            >
              {isPaused ? <RefreshCw className="w-4 h-4" /> : <div className="w-4 h-4 flex items-center justify-center font-bold">||</div>}
            </button>
          )}
          <button
            onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors border border-white/10"
          >
            <Languages className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Ammo HUD */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-8 pointer-events-none">
        {['left', 'center', 'right'].map((pos) => (
          <div key={pos} className="flex flex-col items-center gap-1">
            <div className="h-24 w-1 bg-white/10 rounded-full overflow-hidden flex flex-col-reverse">
              <motion.div
                initial={false}
                animate={{ height: `${(ammo[pos as keyof typeof ammo] / INITIAL_AMMO[pos as keyof typeof ammo]) * 100}%` }}
                className={`w-full ${pos === 'center' ? 'bg-blue-400' : 'bg-blue-500/60'}`}
              />
            </div>
            <span className="text-[10px] font-mono opacity-50 uppercase">{pos}</span>
          </div>
        ))}
      </div>

      {/* Loading Screen */}
      {!isBgLoaded && (
        <div className="absolute inset-0 bg-[#0a0a0a] flex items-center justify-center z-[100]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-blue-400 font-mono text-sm animate-pulse">LOADING ASSETS...</p>
          </div>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {gameState !== 'PLAYING' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full bg-zinc-900 border border-white/10 rounded-3xl p-8 text-center shadow-2xl"
            >
              {gameState === 'START' && (
                <>
                  <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Shield className="w-10 h-10 text-blue-400" />
                  </div>
                  <h1 className="text-4xl font-bold mb-4 tracking-tight">{t.title}</h1>
                  <p className="text-zinc-400 mb-8 leading-relaxed">
                    {t.instructions}
                  </p>
                  <button
                    onClick={startGame}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
                  >
                    <Target className="w-5 h-5" />
                    {t.start}
                  </button>
                </>
              )}

              {gameState === 'WIN' && (
                <>
                  <div className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Trophy className="w-10 h-10 text-yellow-400" />
                  </div>
                  <h1 className="text-4xl font-bold mb-2 text-yellow-400">{t.win}</h1>
                  <p className="text-zinc-400 mb-4">{t.winMsg}</p>
                  <div className="text-2xl font-mono mb-8 bg-black/40 py-3 rounded-xl border border-white/5">
                    {t.score}: {score}
                  </div>
                  <button
                    onClick={startGame}
                    className="w-full py-4 bg-zinc-100 hover:bg-white text-zinc-900 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-5 h-5" />
                    {t.playAgain}
                  </button>
                </>
              )}

              {gameState === 'GAMEOVER' && (
                <>
                  <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertCircle className="w-10 h-10 text-red-400" />
                  </div>
                  <h1 className="text-4xl font-bold mb-2 text-red-400">{t.gameOver}</h1>
                  <p className="text-zinc-400 mb-8">{t.loseMsg}</p>
                  <button
                    onClick={startGame}
                    className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-5 h-5" />
                    {t.playAgain}
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Retro Grid Background Overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-10 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
    </div>
  );
}
