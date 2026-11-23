import assert from 'node:assert/strict';
import {periodGoal,ridesToGoal} from '../public/metrics.js';
import {carryBeforeDay,dayNetWithCarry} from '../shared/daily-balance.ts';
assert.equal(ridesToGoal(5600),7);
assert.equal(ridesToGoal(900),1);
assert.equal(ridesToGoal(901),2);
assert.equal(ridesToGoal(1),1);
assert.equal(ridesToGoal(0),0);
assert.equal(ridesToGoal(-900),0);
const rows=[
 {day:'2026-11-16',gross:10000},
 {day:'2026-11-17',gross:20000},
 {day:'2026-11-18',gross:30000},
 {day:'2026-11-19',gross:40000},
 {day:'2026-11-20',gross:50000},
 {day:'2026-11-21',gross:60000},
 {day:'2026-11-01',gross:90000}
];
const goals=periodGoal(rows,'2026-11-21',20000);
assert.deepEqual(goals.week,{start:'2026-11-16',days:6,gross:210000,target:120000,remaining:0,progress:100});
assert.deepEqual(goals.month,{start:'2026-11-01',days:21,gross:300000,target:420000,remaining:120000,progress:71});
assert.equal(periodGoal([],'2026-11-22',0).week.progress,0);
assert.throws(()=>periodGoal([],'2026-02-30',100));
assert.throws(()=>periodGoal([],'2026-11-21',-1));
const dailyNets=[
 {day:'2026-11-18',net:-8299},
 {day:'2026-11-19',net:2000},
 {day:'2026-11-20',net:10000},
 {day:'2026-11-21',net:-2500}
];
assert.equal(carryBeforeDay(dailyNets,'2026-11-18'),0);
assert.equal(carryBeforeDay(dailyNets,'2026-11-19'),-8299);
assert.equal(carryBeforeDay(dailyNets,'2026-11-20'),-6299);
assert.equal(carryBeforeDay(dailyNets,'2026-11-21'),0);
assert.equal(dayNetWithCarry(0,0,-8299),-8299);
assert.equal(dayNetWithCarry(2000,0,-8299),-6299);
assert.throws(()=>carryBeforeDay([{day:'2026-11-18',net:1.2}],'2026-11-19'));
assert.throws(()=>dayNetWithCarry(0,0,1.2));
console.log('OK: daily carry uses actual recorded income and expenses, applies prior residual to today, and resets after recovery.');
