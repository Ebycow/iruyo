"use client";

import { useEffect, useState } from "react";

export function useMinuteNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let intervalId: number | null = null;
    const msUntilNextMinute = 60_000 - (Date.now() % 60_000);

    const timeoutId = window.setTimeout(() => {
      setNow(Date.now());
      intervalId = window.setInterval(() => {
        setNow(Date.now());
      }, 60_000);
    }, msUntilNextMinute);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  return now;
}
