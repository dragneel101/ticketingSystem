import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const SlaContext = createContext(null);

export function SlaProvider({ children }) {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadPolicies = useCallback(async () => {
    try {
      const res = await fetch('/api/sla-policies');
      if (res.ok) setPolicies(await res.json());
    } catch {
      // non-fatal — UI degrades gracefully with no SLA data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  async function createPolicy(data) {
    const res = await fetch('/api/sla-policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to create policy');
    const policy = await res.json();
    setPolicies((prev) => [...prev, policy]);
    return policy;
  }

  async function updatePolicy(id, data) {
    const res = await fetch(`/api/sla-policies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update policy');
    const policy = await res.json();
    setPolicies((prev) => prev.map((p) => (p.id === id ? policy : p)));
    return policy;
  }

  async function deletePolicy(id) {
    const res = await fetch(`/api/sla-policies/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete policy');
    setPolicies((prev) => prev.filter((p) => p.id !== id));
  }

  async function setDefaultPolicy(id) {
    const res = await fetch(`/api/sla-policies/${id}/set-default`, { method: 'PATCH' });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to set default');
    const policy = await res.json();
    setPolicies((prev) => prev.map((p) => ({ ...p, is_default: p.id === id })));
    return policy;
  }

  return (
    <SlaContext.Provider value={{ policies, loading, loadPolicies, createPolicy, updatePolicy, deletePolicy, setDefaultPolicy }}>
      {children}
    </SlaContext.Provider>
  );
}

export function useSla() {
  const ctx = useContext(SlaContext);
  if (!ctx) throw new Error('useSla must be used inside SlaProvider');
  return ctx;
}
