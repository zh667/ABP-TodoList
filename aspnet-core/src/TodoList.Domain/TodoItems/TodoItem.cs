using System.ComponentModel.DataAnnotations;
using Volo.Abp.Domain.Entities.Auditing;

namespace TodoList.TodoItems;

/// <summary>
/// Represents a todo item entity.
/// </summary>
public class TodoItem : AuditedAggregateRoot<int>
{
    /// <summary>
    /// The user ID that this todo item belongs to.
    /// </summary>
    public int UserId { get; set; }

    /// <summary>
    /// The title/content of the todo item.
    /// </summary>
    [Required]
    [MaxLength(256)]
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// Whether the todo item is completed.
    /// </summary>
    public bool Completed { get; set; }

    protected TodoItem()
    {
        // Required by EF Core
    }

    public TodoItem(int userId, string title, bool completed = false)
    {
        UserId = userId;
        Title = title;
        Completed = completed;
    }
}
