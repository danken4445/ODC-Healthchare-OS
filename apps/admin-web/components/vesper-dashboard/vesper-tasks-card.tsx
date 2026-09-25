"use client";

import { Check, MoreVertical } from "lucide-react";
import React, { useState } from "react";
import type { VesperTask } from "../../hooks/use-vesper-dashboard-data";

interface VesperTasksCardProps {
  tasks: VesperTask[];
  onToggleTask: (taskId: string) => void;
}

export function VesperTasksCard({ tasks, onToggleTask }: VesperTasksCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="vesper-card">
      <div className="vesper-card__header">
        <div>
          <h2 className="vesper-card__title">Tasks</h2>
          <p className="vesper-card__subtitle">Recently created tasks</p>
        </div>
        <div className="vesper-card__actions">
          <button
            className="vesper-icon-btn"
            type="button"
            aria-label="Tasks menu"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <div className="vesper-dropdown-menu">
              <button
                type="button"
                className="vesper-dropdown-item"
                onClick={() => setMenuOpen(false)}
              >
                Mark all completed
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="vesper-table-container">
        <table className="vesper-table">
          <thead>
            <tr>
              <th style={{ width: "65%" }}>Task</th>
              <th style={{ width: "35%" }}>From</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length > 0 ? (
              tasks.map((task) => (
                <tr key={task.id} className="vesper-table-row--task">
                  <td>
                    <div className="vesper-task-cell">
                      <button
                        type="button"
                        className={`vesper-checkbox ${
                          task.completed ? "vesper-checkbox--checked" : ""
                        }`}
                        onClick={() => onToggleTask(task.id)}
                        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
                      >
                        {task.completed && <Check size={12} strokeWidth={3} />}
                      </button>
                      <span
                        className={`vesper-task-label ${
                          task.completed ? "vesper-task-label--done" : ""
                        }`}
                        onClick={() => onToggleTask(task.id)}
                      >
                        {task.label}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="vesper-requester-cell">
                      <div className="vesper-requester-avatar">
                        {task.fromAvatar}
                      </div>
                      <span className="vesper-requester-name">{task.fromName}</span>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} className="vesper-table-empty">
                  No pending tasks available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
