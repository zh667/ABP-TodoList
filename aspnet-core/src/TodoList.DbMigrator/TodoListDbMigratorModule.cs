using TodoList.EntityFrameworkCore;
using Volo.Abp.Autofac;
using Volo.Abp.Modularity;

namespace TodoList.DbMigrator;

[DependsOn(
    typeof(AbpAutofacModule),
    typeof(TodoListEntityFrameworkCoreModule),
    typeof(TodoListApplicationContractsModule)
    )]
public class TodoListDbMigratorModule : AbpModule
{
}
