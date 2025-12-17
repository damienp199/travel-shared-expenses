import React, { useState, useEffect } from 'react';
import { Trash2, Edit2, RotateCcw, Plus, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from './supabaseClient';

export default function SharedExpensesApp() {
    const [amount, setAmount] = useState('');
    const [expenses, setExpenses] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [editAmount, setEditAmount] = useState('');
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);

    // Charger depuis Supabase
    const loadExpenses = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('expenses')
                .select('*')
                .order('date', { ascending: false });

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

    const resetAll = async () => {
        try {
            // Supabase ne permet pas de "TRUNCATE" via l'API client par défaut sans RLS permissif ou fonction RPC.
            // On va supprimer toutes les lignes une par une ou par batch si possible, 
            // ou utiliser une condition qui matche tout (ex: id > 0 si id est int)
            // Note: Delete sans where clause est souvent bloqué par défaut.
            // On va supposer qu'on peut supprimer par ID.

            // Alternative clean: supprimer tout ce qui a un ID non null
            const { error } = await supabase
                .from('expenses')
                .delete()
                .neq('id', -1); // Hack simple pour tout supprimer si la policy le permet

            if (error) throw error;

            setShowResetConfirm(false);
            loadExpenses();
        } catch (error) {
            console.error('Erreur reset:', error);
            alert('Erreur lors de la réinitialisation. Vérifiez les droits.');
        }
    };

    // Calculs
    const tomiTotal = expenses
        .filter(exp => exp.person === 'Tomi')
        .reduce((sum, exp) => sum + exp.amount, 0);

    const damienTotal = expenses
        .filter(exp => exp.person === 'Damien')
        .reduce((sum, exp) => sum + exp.amount, 0);

    const tomiOwed = damienTotal / 2;
    const damienOwed = tomiTotal / 2;

    const balance = damienOwed - tomiOwed;
    const whoOwes = balance > 0 ? 'Damien' : 'Tomi';
    const amountOwed = Math.abs(balance);

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
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 pb-20">
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

                {/* Totaux */}
                <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-blue-50 rounded-lg p-4">
                            <p className="text-sm text-gray-600 mb-1">Tomi a payé</p>
                            <p className="text-2xl font-bold text-blue-600">฿{tomiTotal.toFixed(2)}</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-4">
                            <p className="text-sm text-gray-600 mb-1">Damien a payé</p>
                            <p className="text-2xl font-bold text-purple-600">฿{damienTotal.toFixed(2)}</p>
                        </div>
                    </div>

                    {/* Balance */}
                    <div className={`rounded-lg p-4 text-center ${amountOwed < 0.01 ? 'bg-green-50' : 'bg-orange-50'}`}>
                        {amountOwed < 0.01 ? (
                            <p className="text-green-700 font-semibold">Tout est équilibré ! 🎉</p>
                        ) : (
                            <>
                                <p className="text-sm text-gray-600 mb-1">Balance</p>
                                <p className="text-xl font-bold text-orange-600">
                                    {whoOwes} doit ฿{amountOwed.toFixed(2)}
                                </p>
                            </>
                        )}
                    </div>
                </div>

                {/* Ajout de dépense */}
                <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">Nouvelle dépense</h2>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Montant en bahts"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-3 text-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                        step="0.01"
                        inputMode="decimal"
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => addExpense('Tomi')}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center active:scale-95 transform"
                        >
                            <Plus className="w-5 h-5 mr-1" />
                            Tomi
                        </button>
                        <button
                            onClick={() => addExpense('Damien')}
                            className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center active:scale-95 transform"
                        >
                            <Plus className="w-5 h-5 mr-1" />
                            Damien
                        </button>
                    </div>
                </div>

                {/* Bouton Reset */}
                <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
                    {!showResetConfirm ? (
                        <button
                            onClick={() => setShowResetConfirm(true)}
                            className="w-full bg-red-50 text-red-600 hover:bg-red-100 font-semibold py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center"
                        >
                            <RotateCcw className="w-5 h-5 mr-2" />
                            Réinitialiser tout
                        </button>
                    ) : (
                        <div>
                            <p className="text-center text-gray-700 mb-3 font-semibold">
                                Êtes-vous sûr de vouloir tout effacer ?
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setShowResetConfirm(false)}
                                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-lg transition duration-200"
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={resetAll}
                                    className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
                                >
                                    Confirmer
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Historique */}
                <div className="bg-white rounded-lg shadow-lg p-6">
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-lg font-semibold text-gray-800">
                            Historique ({expenses.length})
                        </h2>
                        <button onClick={loadExpenses} className="text-gray-400 hover:text-indigo-600">
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>

                    {expenses.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                            <p>Aucune dépense enregistrée</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {expenses.map(expense => (
                                <div
                                    key={expense.id}
                                    className={`flex items-center justify-between p-3 rounded-lg border-l-4 transition-all ${expense.person === 'Tomi'
                                        ? 'bg-blue-50 border-blue-500'
                                        : 'bg-purple-50 border-purple-500'
                                        }`}
                                >
                                    {editingId === expense.id ? (
                                        <div className="flex-1 flex items-center gap-2 animate-in fade-in">
                                            <input
                                                type="number"
                                                value={editAmount}
                                                onChange={(e) => setEditAmount(e.target.value)}
                                                className="flex-1 px-2 py-1 border border-gray-300 rounded"
                                                step="0.01"
                                                autoFocus
                                            />
                                            <button
                                                onClick={() => saveEdit(expense.id)}
                                                className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                                            >
                                                ✓
                                            </button>
                                            <button
                                                onClick={cancelEdit}
                                                className="bg-gray-400 text-white px-3 py-1 rounded text-sm hover:bg-gray-500"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ) : deletingId === expense.id ? (
                                        <div className="flex-1 flex items-center justify-between animate-in fade-in gap-2">
                                            <p className="text-sm text-red-600 font-medium">Supprimer ?</p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => deleteExpense(expense.id)}
                                                    className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 font-medium"
                                                >
                                                    Oui
                                                </button>
                                                <button
                                                    onClick={cancelDelete}
                                                    className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-300 font-medium"
                                                >
                                                    Non
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-baseline pr-2">
                                                    <p className="font-bold text-gray-800 text-lg">
                                                        ฿{expense.amount.toFixed(2)}
                                                    </p>
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${expense.person === 'Tomi' ? 'bg-blue-200 text-blue-800' : 'bg-purple-200 text-purple-800'
                                                        }`}>
                                                        {expense.person}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">{formatDate(expense.date)}</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => startEdit(expense)}
                                                    className="text-gray-400 hover:text-blue-600 p-1 transition-colors"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => confirmDelete(expense.id)}
                                                    className="text-gray-400 hover:text-red-600 p-1 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
