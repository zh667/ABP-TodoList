using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace TodoList.Data;

/* This is used if database provider does't define
 * ITodoListDbSchemaMigrator implementation.
 */
public class NullTodoListDbSchemaMigrator : ITodoListDbSchemaMigrator, ITransientDependency
{
    public Task MigrateAsync()
    {
        return Task.CompletedTask;
    }
}
