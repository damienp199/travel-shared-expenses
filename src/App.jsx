import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Edit2, RotateCcw, Plus, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from './supabaseClient';

export default function SharedExpensesApp() {
    const [amount, setAmount] = useState('');
    const [expenses, setExpenses] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [editAmount, setEditAmount] = useState('');
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);
    const expensesEndRef = useRef(null);

    // Constantes pour string magique
    const REIMBURSEMENT_TAG = '(Remboursement)';

    // Charger depuis Supabase
    const loadExpenses = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('expenses')
                .select('*')
                .order('date', { ascending: true });

            if (error) throw error;

            setExpenses(data || []);
            setErrorMessage(null);
        } catch (error) {
            console.error('Erreur chargement:', error);
            setErrorMessage('Impossible de charger les dépenses. Vérifiez votre connexion.');
        } finally {
            setLoading(false);
        }
    };

    // Initialiser au démarrage
    useEffect(() => {
        loadExpenses();

        // Souscription aux changements temps réel (optionnel mais sympa)
        const subscription = supabase
            .channel('expenses_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, (payload) => {
                console.log('Changement détecté:', payload);
                loadExpenses(); // Recharger tout pour simplifier la synchro
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    // Auto-scroll à la fin de la liste quand expenses change
    useEffect(() => {
        expensesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [expenses]);

    const addExpense = async (person) => {
        const value = parseFloat(amount);
        if (isNaN(value) || value <= 0) {
            alert('Veuillez entrer un montant valide');
            return;
        }

        try {
            const newExpense = {
                amount: value,
                person: person,
                date: new Date().toISOString()
            };

            const { error } = await supabase
                .from('expenses')
                .insert([newExpense]);

            if (error) throw error;

            setAmount('');
            // Le rechargement se fera via la souscription ou on peut appeler loadExpenses()
            loadExpenses();
        } catch (error) {
            console.error('Erreur ajout:', error);
            alert('Erreur lors de l\'ajout de la dépense.');
        }
    };

    const deleteExpense = async (id) => {
        try {
            const { error } = await supabase
                .from('expenses')
                .delete()
                .eq('id', id);

            if (error) throw error;
            setDeletingId(null);
            loadExpenses();
        } catch (error) {
            console.error('Erreur suppression:', error);
            alert('Erreur lors de la suppression.');
        }
    };

    const confirmDelete = (id) => {
        setDeletingId(id);
    };

    const cancelDelete = () => {
        setDeletingId(null);
    };

    const startEdit = (expense) => {
        setEditingId(expense.id);
        setEditAmount(expense.amount.toString());
    };

    const saveEdit = async (id) => {
        const value = parseFloat(editAmount);
        if (isNaN(value) || value <= 0) {
            alert('Veuillez entrer un montant valide');
            return;
        }

        try {
            const { error } = await supabase
                .from('expenses')
                .update({ amount: value })
                .eq('id', id);

            if (error) throw error;

            setEditingId(null);
            setEditAmount('');
            loadExpenses();
        } catch (error) {
            console.error('Erreur édition:', error);
            alert('Erreur lors de la modification.');
        }
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditAmount('');
    };

    const settleUp = async () => {
        // "amount" vient de l'input principal (celui utilisé pour ajouter des dépenses)
        const value = parseFloat(amount);
        if (isNaN(value) || value <= 0) {
            alert('Veuillez entrer un montant à rembourser dans la case du haut.');
            return;
        }

        if (!whoOwes) return;

        try {
            // Créer une dépense spéciale qui compte comme remboursement
            // Si Damien doit 500 et paie 500, ça s'ajoute comme "Damien (Remboursement)"
            const reimbursement = {
                amount: value,
                person: `${whoOwes} ${REIMBURSEMENT_TAG}`,
                date: new Date().toISOString()
            };

            const { error } = await supabase
                .from('expenses')
                .insert([reimbursement]);

            if (error) throw error;

            setAmount(''); // Reset input
            setAmount(''); // Reset input
            loadExpenses();
        } catch (error) {
            console.error('Erreur remboursement:', error);
            alert('Erreur lors du remboursement.');
        }
    };

    // Calculs
    // 1. Dépenses partielles (frais)
    const sharedExpenses = expenses.filter(exp => !exp.person.includes(REIMBURSEMENT_TAG));
    // 2. Remboursements directs
    const reimbursements = expenses.filter(exp => exp.person.includes(REIMBURSEMENT_TAG));

    const tomiShared = sharedExpenses
        .filter(exp => exp.person === 'Tomi')
        .reduce((sum, exp) => sum + exp.amount, 0);

    const damienShared = sharedExpenses
        .filter(exp => exp.person === 'Damien')
        .reduce((sum, exp) => sum + exp.amount, 0);

    // Ce que chacun "doit" sur les frais communs (la moitié de ce que l'autre a payé)
    // Ex: Tomi a payé 1000. Damien doit 500.
    const damienOwesOnShared = tomiShared / 2;
    const tomiOwesOnShared = damienShared / 2;

    // Balance brute sur les frais (Positive = Damien doit, Négative = Tomi doit)
    let rawBalance = damienOwesOnShared - tomiOwesOnShared;

    // Ajustement avec les remboursements
    // Si Damien a remboursé, il réduit sa dette (donc on soustrait son remboursement à la balance)
    const damienReimbursed = reimbursements
        .filter(exp => exp.person.includes('Damien'))
        .reduce((sum, exp) => sum + exp.amount, 0);

    // Si Tomi a remboursé (donc donné de l'argent à Damien pour payer sa dette), on ajoute à la balance
    const tomiReimbursed = reimbursements
        .filter(exp => exp.person.includes('Tomi'))
        .reduce((sum, exp) => sum + exp.amount, 0);

    // Balance finale
    const balance = rawBalance - damienReimbursed + tomiReimbursed;

    const whoOwes = balance > 0 ? 'Damien' : 'Tomi';
    const receiver = whoOwes === 'Damien' ? 'Tomi' : 'Damien';
    const amountOwed = Math.abs(balance);
    const isAmountValid = !isNaN(parseFloat(amount)) && parseFloat(amount) > 0;

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading && expenses.length === 0) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Chargement de la base de données...</p>
                </div>
            </div>
        );
    }

    return (

        <div className="flex flex-col h-screen bg-gradient-to-br from-blue-50 to-indigo-100 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 pb-32">
                <div className="max-w-md mx-auto">
                    {errorMessage && (
                        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded shadow-sm">
                            <div className="flex items-center">
                                <AlertCircle className="w-5 h-5 mr-2" />
                                <p>{errorMessage}</p>
                            </div>
                            <button onClick={loadExpenses} className="text-sm underline mt-2">Réessayer</button>
                        </div>
                    )}

                    {/* Historique (Style Chat) */}
                    <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-4 mb-4">
                        <div className="flex justify-between items-center mb-3">
                            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                                Historique ({expenses.length})
                            </h2>
                            <button onClick={loadExpenses} className="text-gray-400 hover:text-indigo-600 transition-colors">
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>

                        {expenses.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <p>Aucune dépense enregistrée</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {expenses.map(expense => (
                                    <div
                                        key={expense.id}
                                        className={`group relative flex items-stretch rounded-xl shadow-sm border border-opacity-50 overflow-hidden transition-all ${expense.person.includes(REIMBURSEMENT_TAG)
                                            ? 'bg-green-50 border-green-200 !border-l-4 !border-green-400'
                                            : expense.person.includes('Tomi')
                                                ? 'bg-blue-50 border-blue-200'
                                                : 'bg-purple-50 border-purple-200'
                                            }`}
                                    >
                                        <div className="flex-1 p-3 flex flex-col justify-center">
                                            <div className="flex items-baseline gap-2">
                                                <span className="font-bold text-gray-800 text-lg">
                                                    ฿{expense.amount.toFixed(0)}
                                                </span>
                                                <span className="text-xs font-medium opacity-75">
                                                    {expense.person.replace(REIMBURSEMENT_TAG, ' (Remb.)')}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1">{formatDate(expense.date)}</p>
                                        </div>

                                        <button
                                            onClick={() => confirmDelete(expense.id)}
                                            className="w-12 flex items-center justify-center bg-black/5 hover:bg-red-100 transition-colors border-l border-black/5"
                                        >
                                            <Trash2 className="w-5 h-5 text-gray-400 hover:text-red-500 transition-colors" />
                                        </button>

                                        {deletingId === expense.id && (
                                            <div className="absolute inset-0 z-10 bg-white/95 backdrop-blur-sm flex items-center justify-end px-3 gap-3 animate-in fade-in slide-in-from-right-5">
                                                <span className="text-sm font-bold text-red-600">Supprimer ?</span>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); cancelDelete(); }}
                                                        className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs font-bold"
                                                    >
                                                        Non
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); deleteExpense(expense.id); }}
                                                        className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold"
                                                    >
                                                        Oui
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <div ref={expensesEndRef} />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Controls (Fixed) */}
            <div className="bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-30">
                <div className="max-w-md mx-auto p-4 pb-8"> {/* pb-8 for iOS home bar */}
                    {/* 2. Balance (Compacte) */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className={`rounded-2xl p-2 flex flex-col justify-center items-center text-center shadow-sm ${amountOwed < 0.01 ? 'bg-green-100 text-green-700' : 'bg-orange-50 border border-orange-100 text-orange-800'}`}>
                            {amountOwed < 0.01 ? (
                                <>
                                    <span className="text-[10px] font-bold text-green-700 uppercase tracking-wide opacity-60">Balance</span>
                                    <span className="font-extrabold text-lg text-green-700">Équilibrée</span>
                                </>
                            ) : (
                                <>
                                    <span className="text-[10px] font-bold uppercase opacity-60 tracking-wide text-orange-800">{whoOwes} doit</span>
                                    <span className="font-black text-2xl text-orange-600">฿{amountOwed.toFixed(0)}</span>
                                </>
                            )}
                        </div>

                        <div className="bg-pink-50 rounded-2xl p-2 flex flex-col justify-center items-center text-center border border-pink-100">
                            <span className="text-[10px] font-bold text-pink-500 uppercase tracking-wide">Indice Bargirl 💃</span>
                            <span className="font-black text-2xl text-pink-600">{(amountOwed / 3000).toFixed(2)}</span>
                        </div>
                    </div>

                    {/* 3. Actions (Input + Boutons) */}
                    <div className="flex gap-3 items-stretch">
                        <div className="relative flex-1">
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="Montant"
                                className="w-full h-full pl-4 pr-2 bg-gray-100 border-0 rounded-xl text-lg font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                                step="0.01"
                                inputMode="decimal"
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => addExpense('Tomi')}
                                disabled={!isAmountValid}
                                className={`flex flex-col items-center justify-center w-16 h-14 bg-blue-500 text-white rounded-xl transition duration-200 ${isAmountValid ? 'active:scale-95' : 'opacity-40'}`}
                            >
                                <span className="text-[10px] uppercase font-bold opacity-80">Tomi</span>
                                <Plus className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => addExpense('Damien')}
                                disabled={!isAmountValid}
                                className={`flex flex-col items-center justify-center w-16 h-14 bg-purple-500 text-white rounded-xl transition duration-200 ${isAmountValid ? 'active:scale-95' : 'opacity-40'}`}
                            >
                                <span className="text-[10px] uppercase font-bold opacity-80">Damien</span>
                                <Plus className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Bouton Rembourser (Glissant) */}
                    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${amountOwed >= 0.01 ? 'max-h-12 mt-3 opacity-100' : 'max-h-0 mt-0 opacity-0'}`}>
                        <button
                            disabled={!isAmountValid}
                            onClick={settleUp}
                            className={`w-full bg-green-500 text-white font-bold text-sm py-2.5 px-4 rounded-xl flex items-center justify-center ${isAmountValid ? 'active:scale-95' : 'opacity-40'}`}
                        >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Rembourser {receiver}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
