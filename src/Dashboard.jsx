import React, { useState } from 'react';
import { C, FN, FB } from './theme';
import { Badge, baseInput } from './ui';

const statusColor = { Active: C.gn, "On Hold": C.or, Inactive: C.td, Trial: C.ac };
const fmtColor = { "In-Person Private": C.ac, "In-Person Couple": C.pu, "In-Person Group": C.or, Online: C.gn, Hybrid: C.tm };

export default function Dashboard({ trainees, plans, workouts, payments, onSelectTrainee }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFormat, setFilterFormat] = useState("");

  const enriched = trainees.map(t => {
    const tPlans = plans.filter(p => p.traineeId === t.id);
    const tWorkouts = workouts.filter(w => w.traineeId === t.id && w.status === "completed");
    const tPayments = payments.filter(p => p.traineeId === t.id);
    const totalPaid = tPayments.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    const lastPayment = tPayments.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const lastWorkout = tWorkouts.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    return { ...t, planCount: tPlans.length, workoutCount: tWorkouts.length, totalPaid, lastPayment, lastWorkout };
  });
