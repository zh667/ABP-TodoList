using AutoMapper;
using TodoList.TodoItems;

namespace TodoList;

public class TodoListApplicationAutoMapperProfile : Profile
{
    public TodoListApplicationAutoMapperProfile()
    {
        /* You can configure your AutoMapper mapping configuration here.
         * Alternatively, you can split your mapping configurations
         * into multiple profile classes for a better organization. */

        CreateMap<TodoItem, TodoItemDto>();
        CreateMap<CreateUpdateTodoItemDto, TodoItem>();
    }
}
