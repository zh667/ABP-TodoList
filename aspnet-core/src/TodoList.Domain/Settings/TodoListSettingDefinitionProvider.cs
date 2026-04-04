using Volo.Abp.Settings;

namespace TodoList.Settings;

public class TodoListSettingDefinitionProvider : SettingDefinitionProvider
{
    public override void Define(ISettingDefinitionContext context)
    {
        //Define your own settings here. Example:
        //context.Add(new SettingDefinition(TodoListSettings.MySetting1));
    }
}
