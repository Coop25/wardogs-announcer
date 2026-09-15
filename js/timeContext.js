/**
 * timeContext.js
 * Computes a rich time-context object from the browser's local clock only.
 * No geolocation, no network, no timezone assumptions beyond `new Date()`.
 */
(function (global) {
  'use strict';

  const DAY_NAMES = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
  ];

  /**
   * @param {Date} [date] - defaults to now
   * @returns {{
   *   hour: number, minute: number, dayOfWeek: string, dayIndex: number,
   *   period: string, contexts: string[],
   *   currentTime: string, timePeriodLabel: string
   * }}
   */
  function getTimeContext(date) {
    const d = date instanceof Date ? date : new Date();
    const hour = d.getHours();
    const minute = d.getMinutes();
    const dayIndex = d.getDay();
    const dayOfWeek = DAY_NAMES[dayIndex];
    const isWeekend = dayIndex === 0 || dayIndex === 6;

    const contexts = new Set();

    // Broad four-way period bucket (per spec section 10)
    let period;
    if (hour >= 5 && hour < 12) period = 'morning';
    else if (hour >= 12 && hour < 17) period = 'afternoon';
    else if (hour >= 17 && hour < 22) period = 'evening';
    else period = 'night';
    contexts.add(period);

    // Finer-grained contexts, allowed to overlap.
    if (hour >= 5 && hour < 8) contexts.add('earlyMorning');
    if (hour >= 5 && hour < 12) contexts.add('morning');
    if (hour >= 10 && hour < 12) contexts.add('lateMorning');
    if (hour >= 11 && hour < 13) contexts.add('lunch');
    if (hour >= 12 && hour < 17) contexts.add('afternoon');
    if (hour >= 17 && hour < 22) contexts.add('evening');
    if (hour >= 22 || hour < 5) contexts.add('night');
    if (hour >= 22 || hour < 2) contexts.add('lateNight');
    if (hour === 23 || hour === 0) contexts.add('midnight');
    if (hour >= 0 && hour < 3) contexts.add('afterMidnight');
    if (hour >= 2 && hour < 5) contexts.add('middleOfNight');

    if (isWeekend) contexts.add('weekend');
    else contexts.add('weekday');

    if (dayIndex === 1 && hour >= 5 && hour < 12) contexts.add('mondayMorning');
    if (dayIndex === 5 && hour >= 17) contexts.add('fridayNight');
    if (dayIndex === 5) contexts.add('friday');
    if (dayIndex === 0) contexts.add('sunday');

    contexts.add('any');

    const currentTime = d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit'
    });

    return {
      hour,
      minute,
      dayOfWeek,
      dayIndex,
      period,
      contexts: Array.from(contexts),
      currentTime,
      timePeriodLabel: period.charAt(0).toUpperCase() + period.slice(1)
    };
  }

  global.WardogsTimeContext = { getTimeContext };
})(typeof window !== 'undefined' ? window : globalThis);
