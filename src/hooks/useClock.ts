import { useState, useEffect } from 'react'

export function useClock(): string {
  const [time, setTime] = useState<string>('--:--:-- UTC')

  useEffect(() => {
    function tick() {
      const utc = new Date().toUTCString().split(' ')[4]
      setTime(utc + ' UTC')
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return time
}
