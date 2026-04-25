import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

// Singleton socket instance shared across components
let socketInstance = null

const getSocket = () => {
  if (!socketInstance) {
    socketInstance = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
      auth: { token: localStorage.getItem('token') },
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket'],
    })
  }
  return socketInstance
}

export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect()
    socketInstance = null
  }
}

/**
 * useSocket — registers event handlers on the shared socket.
 * @param {Record<string, Function>} handlers  e.g. { seat_taken: fn, seat_released: fn }
 * @param {any[]} deps  dependency array to re-register handlers
 */
export const useSocket = (handlers = {}, deps = []) => {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const socket = getSocket()

    const cleanup = []
    for (const [event, handler] of Object.entries(handlersRef.current)) {
      socket.on(event, handler)
      cleanup.push(() => socket.off(event, handler))
    }

    return () => cleanup.forEach((fn) => fn())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return getSocket()
}
