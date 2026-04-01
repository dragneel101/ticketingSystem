import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const BoardContext = createContext(null);

export function BoardProvider({ children }) {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadBoards = useCallback(async () => {
    try {
      const res = await fetch('/api/boards');
      if (res.ok) {
        const data = await res.json();
        setBoards(data.boards || []);
      }
    } catch {
      // non-fatal — UI degrades gracefully with no board data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBoards(); }, [loadBoards]);

  const createBoard = useCallback(async (name) => {
    const res = await fetch('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create board');
    }
    const board = await res.json();
    setBoards((prev) => [...prev, board].sort((a, b) => a.name.localeCompare(b.name)));
    return board;
  }, []);

  const updateBoard = useCallback(async (id, name) => {
    const res = await fetch(`/api/boards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update board');
    }
    const board = await res.json();
    setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, ...board } : b)));
    return board;
  }, []);

  const deleteBoard = useCallback(async (id) => {
    const res = await fetch(`/api/boards/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete board');
    }
    setBoards((prev) => prev.filter((b) => b.id !== id));
  }, []);

  return (
    <BoardContext.Provider value={{ boards, loading, loadBoards, createBoard, updateBoard, deleteBoard }}>
      {children}
    </BoardContext.Provider>
  );
}

export function useBoards() {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoards must be used inside BoardProvider');
  return ctx;
}
