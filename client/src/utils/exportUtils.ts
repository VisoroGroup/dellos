import { Task, STATUSES, DEPARTMENTS } from '../types';
import { formatDate } from './helpers';

export function exportToCSV(tasks: Task[], filename: string = 'tasks') {
    const headers = ['Titlu', 'Status', 'Data limită', 'Departament', 'Creat de', 'Subtask-uri'];

    const rows = tasks.map(task => [
        `"${(task.title || '').replace(/"/g, '""')}"`,
        STATUSES[task.status]?.label || task.status,
        task.due_date ? formatDate(task.due_date) : '-',
        task.department_label && DEPARTMENTS[task.department_label]
            ? DEPARTMENTS[task.department_label].label
            : '-',
        `"${(task.creator_name || '-').replace(/"/g, '""')}"`,
        `${task.subtask_completed || 0}/${task.subtask_total || 0}`,
    ]);

    // BOM for UTF-8 so Excel opens correctly
    const bom = '\uFEFF';
    const csvContent = bom + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}
