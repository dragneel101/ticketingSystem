import { useState } from 'react';
import { useBoards } from '../context/BoardContext';
import { useToast } from '../context/ToastContext';

export default function BoardsAdminPanel() {
  const { boards, createBoard, updateBoard, deleteBoard } = useBoards();
  const { addToast } = useToast();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await createBoard(newName.trim());
      setNewName('');
      addToast('Board created', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to create board', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id) {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await updateBoard(id, editName.trim());
      setEditingId(null);
      addToast('Board renamed', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to rename board', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setSaving(true);
    try {
      await deleteBoard(id);
      setDeletingId(null);
      addToast('Board deleted', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to delete board', 'error');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(board) {
    setEditingId(board.id);
    setEditName(board.name);
    setDeletingId(null);
  }

  return (
    <div className="boards-admin-panel">
      {/* Existing boards table */}
      {boards.length > 0 ? (
        <table className="boards-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Tickets</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {boards.map((board) => (
              <tr key={board.id}>
                <td>
                  {editingId === board.id ? (
                    <input
                      className="form-input boards-rename-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdate(board.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <span className="boards-name">{board.name}</span>
                  )}
                </td>
                <td className="boards-ticket-count">{board.ticket_count ?? 0}</td>
                <td className="boards-actions">
                  {editingId === board.id ? (
                    <>
                      <button
                        className="btn btn--sm btn-primary"
                        onClick={() => handleUpdate(board.id)}
                        disabled={saving || !editName.trim()}
                      >
                        Save
                      </button>
                      <button
                        className="btn btn--sm btn-ghost"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : deletingId === board.id ? (
                    <>
                      <span className="boards-confirm-text">Delete?</span>
                      <button
                        className="btn btn--sm btn-danger"
                        onClick={() => handleDelete(board.id)}
                        disabled={saving}
                      >
                        Yes, delete
                      </button>
                      <button
                        className="btn btn--sm btn-ghost"
                        onClick={() => setDeletingId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn btn--sm btn-ghost"
                        onClick={() => startEdit(board)}
                      >
                        Rename
                      </button>
                      <button
                        className="btn btn--sm btn-ghost boards-delete-btn"
                        onClick={() => { setDeletingId(board.id); setEditingId(null); }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="boards-empty">No boards yet. Create one below to start routing tickets.</p>
      )}

      {/* Add new board */}
      <form className="boards-add-form" onSubmit={handleCreate}>
        <input
          className="form-input"
          placeholder="New board name, e.g. L1 Support"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={100}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving || !newName.trim()}
        >
          Add Board
        </button>
      </form>
    </div>
  );
}
