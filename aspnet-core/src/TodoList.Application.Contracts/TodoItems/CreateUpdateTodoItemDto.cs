using System.ComponentModel.DataAnnotations;

namespace TodoList.TodoItems;

/// <summary>
/// DTO for creating or updating a todo item.
/// </summary>
public class CreateUpdateTodoItemDto
{
    public int UserId { get; set; }

    [Required]
    [MaxLength(256)]
    public string Title { get; set; } = string.Empty;

    public bool Completed { get; set; }
}
